import { Octokit } from "@octokit/rest";
import { RateLimitConfig, RateLimitManager } from "safe-calls";

export type OutputFormat = "json" | "string" | "buffer";

export class GitHubRepoLoader {
    private octokit: Octokit;
    private rateLimitManager: RateLimitManager;
    private ignoredFiles: Set<string>;

    constructor(
        authToken: string,
        options?: Partial<RateLimitConfig>
    ) {
        const {
            concurrency = 1,
            intervalMs = 1000,
            requestsPerInterval = 1,
            retries = 3,
        } = options || {};

        this.octokit = new Octokit({ auth: authToken });

        this.rateLimitManager = new RateLimitManager({
            github: {
                concurrency,
                intervalMs,
                requestsPerInterval,
                retries,
            },
        });
        this.ignoredFiles = new Set();
    }

    async fetchRateLimit() {
        const response = await this.wrapWithRateLimit("github", () =>
            this.octokit.rateLimit.get()
        );
        return response.data.resources.core;
    }

    async fetchRepoContent(
        owner: string,
        repo: string,
        branch = "main",
        decodeContent: boolean = false,
        ignoreGitIgnoreFiles: boolean = true,
        outputFormat: OutputFormat = "json",
        filterFn?: (path: string) => boolean
    ) {
        const { remaining } = await this.fetchRateLimit();
        if (remaining === 0) {
            throw new Error("GitHub Rate limit exceeded. Please try again later.");
        }

        if (ignoreGitIgnoreFiles) {
            await this.loadGitignore(owner, repo);
        }

        const files = await this.getRepoFiles(owner, repo, branch, filterFn);
        const contents = await Promise.all(
            files.map(async (file) =>
                this.fetchFileContent(owner, repo, file as any, decodeContent)
            )
        );

        return this.formatOutput(
            contents.filter(Boolean) as { path: string; content: string }[],
            outputFormat
        );
    }

    async *fetchRepoContentStream(
        owner: string,
        repo: string,
        branch = "main",
        decodeContent: boolean = false,
        ignoreGitIgnoreFiles: boolean = true,
        outputFormat: OutputFormat = "json",
        filterFn?: (path: string) => boolean
    ) {
        const { remaining } = await this.fetchRateLimit();
        if (remaining === 0) {
            throw new Error("GitHub Rate limit exceeded. Please try again later.");
        }

        if (ignoreGitIgnoreFiles) {
            await this.loadGitignore(owner, repo);
        }

        const files = await this.getRepoFiles(owner, repo, branch, filterFn);

        for (const file of files) {
            const content = await this.fetchFileContent(
                owner,
                repo,
                file as any,
                decodeContent
            );
            if (content) yield this.formatOutput([content], outputFormat);
        }
    }

    private async getRepoFiles(
        owner: string,
        repo: string,
        branch: string,
        filterFn?: (path: string) => boolean
    ) {
        const commitData = await this.wrapWithRateLimit("github", () =>
            this.octokit.repos.getCommit({ owner, repo, ref: branch })
        );
        const treeSha = commitData?.data?.commit?.tree?.sha;
        if (!treeSha) throw new Error("Tree SHA not found");

        const treeData = await this.wrapWithRateLimit("github", () =>
            this.octokit.git.getTree({
                owner,
                repo,
                tree_sha: treeSha,
                recursive: "true",
            })
        );

        return treeData.data.tree.filter(
            (item) =>
                item.type === "blob" &&
                (!filterFn || filterFn(item.path!)) &&
                !this.ignoredFiles.has(item.path!)
        );
    }

    private async fetchFileContent(
        owner: string,
        repo: string,
        file: { path: string },
        decodeContent: boolean
    ) {
        const response = await this.wrapWithRateLimit("github", () =>
            this.octokit.repos.getContent({ owner, repo, path: file.path! })
        );

        if (response.data && "content" in response.data) {
            let content = Buffer.from(response.data.content, "base64");
            if (decodeContent) {
                content = Buffer.from(content.toString("utf-8"));
            }
            return { path: file.path!, content: content.toString("utf-8") };
        }

        return null;
    }

    private formatOutput(
        files: { path: string; content: string }[],
        format: OutputFormat
    ) {
        switch (format) {
            case "json":
                return files;
            case "string":
                return files
                    .map((f) => `File: ${f.path}\nContent:\n${f.content}\n---\n`)
                    .join("\n");
            case "buffer":
                return Buffer.from(
                    files
                        .map((f) => `File: ${f.path}\nContent:\n${f.content}\n---\n`)
                        .join("\n"),
                    "utf-8"
                );
            default:
                throw new Error(`Unsupported output format: ${format}`);
        }
    }

    private async loadGitignore(owner: string, repo: string) {
        try {
            const response = await this.wrapWithRateLimit("github", () =>
                this.octokit.repos.getContent({ owner, repo, path: ".gitignore" })
            );
            if (response.data && "content" in response.data) {
                const gitignoreContent = Buffer.from(
                    response.data.content,
                    "base64"
                ).toString("utf-8");
                this.ignoredFiles = new Set(
                    gitignoreContent
                        .split("\n")
                        .map((line) => line.trim())
                        .filter((line) => line && !line.startsWith("#"))
                );
            }
        } catch (error) {
            console.warn("No .gitignore file found or error reading it");
        }
    }

    private async wrapWithRateLimit<T>(
        key: string,
        fn: () => Promise<T>
    ): Promise<T> {
        return this.rateLimitManager.wrap(key, fn)();
    }
}
