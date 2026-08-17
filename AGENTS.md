# Agent Instructions

Keep changes minimal, focused, and aligned with the existing project structure.

## Project Structure

This project is intentionally small, so organize code by scope rather than by feature. Prefer top-level folders such as `controllers`, `services`, `models`, and `routes` when they help keep the codebase easy to navigate.

Keep the structure simple and avoid introducing extra layers unless the codebase clearly needs them.

## Interface naming convention

All TypeScript interfaces must use the `I` prefix in their names, such as `IUser`, `IStoredUser`, `IAuthRouterDependencies`, and `IBaseServiceInterface`.

Rules:
1. Use `I` as the first character for every interface declaration and exported interface type.
2. Keep names descriptive and domain-specific, with the `I` prefix applied consistently across related files.
3. When a file exports multiple interfaces, each one still follows the same pattern (`I...`).
4. Barrel exports and import statements must use the same `I...` names.
5. Do not introduce plain interface names without the prefix for new code.

## Documentation

For every feature or behavior change, add or update documentation under `docs/` describing the implemented behavior, configuration, usage, and relevant testing instructions. Documentation updates are part of the Definition of Done and must be committed with the feature.

Also keep the project model map in sync: update `models-map.md` whenever a new Mongo collection/model is added, or when an existing model is changed, renamed, or removed.

## Developing API endpoints

When asked to develop new api endpoint, always be sure that the following items are included in the Definition of Done:

1. Api documentation following OpenApi standard
2. Check the correct pattern to implement endpoint (controllers, services, models, ecc..)
3. Check that every endpoint logs the most important steps of the API purpose
4. Add tests that will use the test database connection to perform actual api calls
