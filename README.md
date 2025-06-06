# Twitter Archive MCP

A TypeScript-based MCP server for exploring and sampling your Twitter archive data. It provides tools to sample original tweets, clean up tweet text for LLMs, and more.

Built for exactly my need, and nothing more.

## Features
- Sample random original tweets (excluding retweets)
- Clean tweet text for LLMs (replace mentions, hashtags, links with tokens)
- Easily extensible MCP server

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Build the project:
   ```sh
   npm run build
   ```
3. Start the server with your Twitter archive ZIP:
   ```sh
   npm start -- path/to/twitter-archive.zip
   ```

## Usage
- The server exposes tools and resources for sampling and exploring your tweets via the MCP protocol.
- See `src/server.ts` for customization and extension.

## License

This project was entirely AI coded, and thus is released under the [Unlicense](https://unlicense.org). Please see [LICENSE.md](./LICENSE.md).

## Scripts
- `npm run build` — Compile TypeScript to JavaScript
- `npm start` — Run the compiled server

## Project Structure
- `src/` — TypeScript source files
- `dist/` — Compiled JavaScript output
