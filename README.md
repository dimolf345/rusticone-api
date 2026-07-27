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

## MongoDB

Copy `.env.example` to `.env` when running the API locally. The development
Docker Compose setup starts MongoDB 7 and connects using
`mongodb://mongo:27017/rusticone-dev`:

```sh
npm run docker:dev
```

For production, provide an external MongoDB connection string through
`MONGODB_URI` before starting Compose. Authentication is supported by putting
credentials in that URI; do not commit them to the repository.

The test Compose setup uses a separate MongoDB container and database:

```sh
docker compose -f docker-compose.test.yml up --build
```

The application retries failed MongoDB connections five times by default.
Override `MONGODB_MAX_RETRIES` and `MONGODB_RETRY_DELAY_MS` as needed.
