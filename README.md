# rusticone-catering-api

Express backend written in TypeScript and intended to run inside a Docker dev container.

## Project Structure

The codebase is organized by scope rather than by feature. Because this project is small, keep folders like `controllers`, `services`, `models`, and `routes` at the top level when you add new code.

This keeps the structure predictable without adding unnecessary layers.

## Scripts

- `npm run dev` - start the server in watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm run start` - run the compiled server
- `npm run typecheck` - run the TypeScript compiler without emitting files
