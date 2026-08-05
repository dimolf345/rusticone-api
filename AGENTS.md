# Agent Instructions

Keep changes minimal, focused, and aligned with the existing project structure.

## Project Structure

This project is intentionally small, so organize code by scope rather than by feature. Prefer top-level folders such as `controllers`, `services`, `models`, and `routes` when they help keep the codebase easy to navigate.

Keep the structure simple and avoid introducing extra layers unless the codebase clearly needs them.

## Developing API andpoints
When asked to develop new api endpoint, always be sure that the following items are included in the Definition of Done:
1. Api documentation following OpenApi standard
2. Check the correct pattern to implement endpoint (controllers, services, models, ecc..)
3. Check that every endpoint logs the most important steps of the API purpose
4. Add tests that will use the test database connection to perform actual api calls