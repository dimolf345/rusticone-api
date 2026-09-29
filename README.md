# rusticone-catering-api

Express backend written in TypeScript and intended to run inside a Docker dev container.

## Project Structure

The codebase is organized by scope rather than by feature. Because this project is small, keep folders like `controllers`, `services`, `models`, and `routes` at the top level when you add new code.

This keeps the structure predictable without adding unnecessary layers.

## Documentation

- [Authentication and sessions](docs/authentication.md)
- [Base CRUD architecture](docs/base-crud.md)
- [Error handling](docs/error-handling.md)
- [Logging](docs/logging.md)
- [Quotes](docs/quotes.md)
- [Uploads](docs/uploads.md)
- [Users](docs/users.md)
- [Email notifications](docs/email-notifications.md)

## Installation Guide

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ or v24 recommended)
- [Docker](https://www.docker.com/) and Docker Compose

### 1. Install Dependencies

```sh
npm install
```

### 2. Environment Configuration

- **Development**: Copy `.env.example` to `.env` and adjust the variables as needed:
  ```sh
  cp .env.example .env
  ```
- **Production**: Create `.env.production` (using `.env.example` as a template). Configure production credentials including `MONGO_INITDB_DATABASE` (external MongoDB URI), `REDIS_URL`, `CLOUDINARY_*` credentials, secure `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, and allowed `FRONTEND_ORIGINS`.

### 3. Running the Application

#### Using Docker (Recommended)

- **Development Stack** (API in watch mode, MongoDB 7, and Redis 7):
  ```sh
  npm run docker:dev
  ```
  To stop development containers:
  ```sh
  npm run docker:dev:down
  ```

- **Production Stack** (Production build container using `.env.production`):
  ```sh
  npm run docker:prod
  ```
  To stop the production container:
  ```sh
  npm run docker:prod:down
  ```

#### Running Locally (Without Docker)

- **Development** (requires local MongoDB and Redis instances):
  ```sh
  npm run dev
  ```
- **Production**:
  Build TypeScript and start the compiled application:
  ```sh
  npm run build
  npm run start
  ```
  Alternatively, run in watch mode with production environment variables:
  ```sh
  npm run dev:prod
  ```

## Available Commands

### Development & Production

| Command | Description |
| --- | --- |
| `npm run dev` | Start the server in watch mode with inspector enabled on port `9229` using `.env`. |
| `npm run dev:prod` | Start the server in watch mode with production environment variables (`.env.production`). |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm run start` | Run the compiled server (`dist/server.js`). |

### Docker

| Command | Description |
| --- | --- |
| `npm run docker:dev` | Start the development environment (API, MongoDB, Redis) via Docker Compose (`docker-compose.dev.yml`). |
| `npm run docker:dev:down` | Stop and remove the development Docker Compose containers. |
| `npm run docker:prod` | Build and run the production API container via Docker Compose (`docker-compose.prod.yml`) using `.env.production`. |
| `npm run docker:prod:down` | Stop and remove the production Docker Compose container. |
| `npm run docker:build` | Build the standalone production Docker image (`rusticone-catering-api`) using `Dockerfile`. |

### Testing

| Command | Description |
| --- | --- |
| `npm test` | Run tests in an isolated Docker Compose test stack (`docker-compose.test.yml`). |
| `npm run test:local` | Run tests locally using `test.config.ts`. |

### Code Quality

| Command | Description |
| --- | --- |
| `npm run typecheck` | Run the TypeScript compiler without emitting files to verify types. |
| `npm run lint` | Run ESLint across the codebase. |
| `npm run lint:fix` | Run ESLint and automatically fix lint issues where possible. |

## MongoDB

Copy `.env.example` to `.env` when running the API locally. The development
Docker Compose setup starts MongoDB 7 and connects using
`mongodb://mongo:27017/rusticone-dev`:

```sh
npm run docker:dev
```

For production, provide an external MongoDB connection string through
`MONGO_INITDB_DATABASE` in `.env.production` before starting Compose with `npm run docker:prod`. Authentication is supported by putting
credentials in that URI; do not commit them to the repository.

The test Compose setup uses a separate MongoDB container and database:

```sh
npm test
```

The test API is built as the `rusticone-api-test` image. The production image
(`rusticone-catering-api`) remains dedicated to running the backend server.

The test MongoDB is exposed on host port `27018`, while development MongoDB
continues to use port `27017`. The Compose test API connects to MongoDB using
the internal address `mongo-test:27017`.

The application retries failed MongoDB connections five times by default.
Override `MONGODB_MAX_RETRIES` and `MONGODB_RETRY_DELAY_MS` as needed.
