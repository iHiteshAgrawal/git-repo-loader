# git-repo-loader

**git-repo-loader** is a lightweight library to fetch and stream GitHub repository content efficiently while handling rate limits.

## Features

- Fetches entire repository content, including file contents
- Supports streaming large repositories to prevent memory issues
- Respects `.gitignore` files (optional)
- Handles GitHub API rate limits automatically
- Supports multiple output formats: `json`, `string`, `buffer`

## Installation

```sh
npm install git-repo-loader
```

or

```sh
yarn add git-repo-loader
```

## Usage

### Fetch entire repository content

```ts
import { GitHubRepoLoader } from "git-repo-loader";

const fetcher = new GitHubRepoLoader("your_github_token", {
  concurrency: 50,
  intervalMs: 3600000, // 1 hour
  requestsPerInterval: 5000, // 5000 for authenticated requests, 60 for non-authenticated
});

(async () => {
  const content = await fetcher.fetchRepoContent(
    "owner",
    "repo",
    "main",
    true, // Decode base64 content
    true, // Ignore .gitignore files
    "json" // Output format
  );
  console.log(content);
})();
```

### Stream repository content (for large repos)

```ts
import { GitHubRepoLoader } from "git-repo-loader";

const fetcher = new GitHubRepoLoader("your_github_token", {
  concurrency: 50,
  intervalMs: 3600000,
  requestsPerInterval: 5000,
});

(async () => {
  for await (const [chunk] of fetcher.fetchRepoContentStream(
    "owner",
    "repo",
    "main",
    false,
    true,
    "string"
  )) {
    console.log(chunk);
  }
})();
```

## API

### `new GitHubRepoLoader(authToken: string)`

Creates a new instance with GitHub authentication.

### `fetchRepoContent(owner, repo, branch, decodeContent, ignoreGitIgnoreFiles, outputFormat)`

Fetches the entire repo content and returns it in the specified format.

### `fetchRepoContentStream(owner, repo, branch, decodeContent, ignoreGitIgnoreFiles, outputFormat)`

Returns an async generator to stream repo content.

### Output Formats

- `json`: Returns an array of `{ path, content }` objects.
- `string`: Returns a formatted string.
- `buffer`: Returns a `Buffer`.

## License

MIT License © [Hitesh Agrawal](https://github.com/iHiteshAgrawal)
