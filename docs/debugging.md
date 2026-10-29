# Debugging the Server in Docker

This guide explains how to attach a debugger to the Node.js / Express API running inside the development Docker container.

## Architecture

When running the development environment (`npm run docker:dev`), the API container executes the server via `tsx watch` with Node's V8 inspector enabled:

- **Inspector Flag:** `--inspect=0.0.0.0:9229` (binds the debugger to all network interfaces inside the container).
- **Port Mapping:** `docker-compose.dev.yml` forwards `9229:9229` from the container to the host machine (`localhost:9229`).
- **Source Mapping:** VS Code maps host workspace files (`localRoot: ${workspaceFolder}`) to container paths (`remoteRoot: /app`).

## Configuration

### 1. Docker Compose (`docker-compose.dev.yml`)

The API service exposes both the application HTTP port (`3000`) and the Node inspector port (`9229`):

```yaml
services:
  api:
    ports:
      - "3000:3000"
      - "9229:9229" # Inspector port
```

### 2. VS Code Launch Configuration (`.vscode/launch.json`)

The project includes an attach configuration in `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Docker Node",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "address": "localhost",
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "/app",
      "restart": true,
      "sourceMaps": true
    }
  ]
}
```

Key configuration options:
- `address`: `localhost` (connects to the forwarded host port).
- `port`: `9229`.
- `localRoot` / `remoteRoot`: Translates host paths to `/app` inside the container so breakpoints resolve properly.
- `restart`: `true` automatically re-attaches the debugger when `tsx watch` restarts the process upon file changes.

## Step-by-Step: Debugging with VS Code

### Step 1: Start the Development Container

In your host terminal:

```sh
npm run docker:dev
```

Verify in the logs that the inspector is listening:

```text
Debugger listening on ws://0.0.0.0:9229/...
```

### Step 2: Attach from the Host VS Code Window

> [!IMPORTANT]
> Run the debugger from your **normal (host) VS Code window**, not from a window connected to the container via Dev Containers. The `localRoot` / `remoteRoot` path translation is designed for host-to-container debugging.

1. Open the **Run and Debug** view in VS Code (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>).
2. Select **`Attach to Docker Node`** from the configuration dropdown at the top.
3. Click the green **Start Debugging (F5)** button.
4. The VS Code status bar will turn orange/blue and the debug control toolbar will appear, confirming the debugger is attached.

### Step 3: Setting Breakpoints

Set breakpoints in TypeScript source files inside `src/` (such as in `src/controllers/`, `src/services/`, or `src/middleware/`).

> [!NOTE]
> **Breakpoint Placement:**
> - Place breakpoints **inside the handler methods** (such as `controller.createOne`, `controller.delete`, or `service.delete`).
> - Do **not** place breakpoints on route registration lines (such as `router.delete("/:id", ...)`), because those lines execute only once during server startup, not when incoming HTTP requests are received.

### Step 4: Verify Breakpoint Status

- **Solid Red Circle 🔴:** The breakpoint is bound to the running process and source maps match. It will pause execution when the code path runs.
- **Hollow Grey Circle ⚪ ("Unbound breakpoint"):** The debugger is not attached, the file has not been loaded into the Node runtime yet, or path mappings do not match.

## `--inspect` vs `--inspect-brk`

In `package.json`, the `dev` script can use either:

- **`--inspect=0.0.0.0:9229` (Default):**
  The server starts normally and listens for HTTP requests immediately. You can attach and detach the debugger at any time without halting boot.

- **`--inspect-brk=0.0.0.0:9229`:**
  The server halts on the first line of code during startup and waits until a debugger attaches. Once attached, press <kbd>F5</kbd> (Continue) to resume execution. Useful when debugging startup initialization issues.

## Alternative: Debugging with Chrome / Edge DevTools

If you prefer using browser developer tools:

1. Ensure the development container is running.
2. Open Chrome or Edge and navigate to:
   ```text
   chrome://inspect
   ```
3. Under **Remote Target**, locate the Node.js target (`src/server.ts`).
4. Click **Inspect** to launch Chrome DevTools with full source maps, call stack, and console inspection.

## Troubleshooting

### Breakpoints Are Unbound (Hollow Grey Dot)
1. Verify that `npm run docker:dev` is running and container port `9229` is published (`docker ps`).
2. Verify that the debugger is actively attached (press <kbd>F5</kbd> on "Attach to Docker Node").
3. Ensure `.vscode/launch.json` has `sourceMaps: true` and the correct `remoteRoot: "/app"`.

### Debugger Disconnects on Code Edit
The server uses `tsx watch`, which reboots the Node process upon saving a file. With `"restart": true` in `.vscode/launch.json`, VS Code will automatically attempt to reconnect to the new process within 1–2 seconds.

### Port 9229 Already in Use
If another local Node process or previous container is holding port `9229`:
1. Stop running containers with `npm run docker:dev:down`.
2. Ensure no local Node processes are running on port `9229`.
3. Restart with `npm run docker:dev`.

