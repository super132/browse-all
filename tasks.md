# Implementation Tasks

Tasks are ordered by dependency — complete each group before moving to the next.

---

## 1. Project Scaffolding

- [ ] Initialise `package.json` with name `browser-tool`, version `0.1.0`, and `"type": "commonjs"`
- [ ] Add `bin` field pointing to `dist/cli.js` with binary name `browser-tool`
- [ ] Add `scripts`: `build` (`tsc`), `dev` (`ts-node src/cli.ts`), `clean` (`rm -rf dist`)
- [ ] Create `tsconfig.json` with `target: ES2020`, `module: commonjs`, `outDir: ./dist`, `strict: true`, `esModuleInterop: true`
- [ ] Install runtime dependencies: `playwright`, `uuid`
- [ ] Install dev dependencies: `typescript`, `ts-node`, `@types/node`, `@types/uuid`
- [ ] Install Playwright Chromium browser: `npx playwright install chromium`
- [ ] Add `dist/` and `node_modules/` to `.gitignore`
- [ ] Select and install an HTML-to-markdown library (e.g. `turndown` + `@types/turndown`)
- [ ] Select and install a CLI argument parsing library (e.g. `commander` or `yargs`)

---

## 2. Shared Types (`src/types.ts`)

- [ ] Define `ErrorCode` union type: `SESSION_NOT_FOUND`, `NAVIGATION_FAILED`, `ELEMENT_NOT_FOUND`, `TIMEOUT`, `DOWNLOAD_FAILED`, `UPLOAD_FAILED`, `INVALID_ARGUMENTS`
- [ ] Define `ErrorResponse` interface: `{ error: string; code: ErrorCode }`
- [ ] Define `InteractiveElement` union type: link, button, input variants (each with `selector`)
- [ ] Define `StartResponse` interface
- [ ] Define `NavigateResponse` interface
- [ ] Define `ReadResponse` interface (includes `markdown`, `screenshotPath`, `interactiveElements`)
- [ ] Define `ActionResponse` interface (generic action responses for click, type, scroll, hover, upload, wait)
- [ ] Define `DownloadResponse` interface
- [ ] Define `CloseResponse` interface

---

## 3. Session Layer

### `src/session/BrowserSession.ts`

- [ ] Define `BrowserSession` class holding `id`, `context`, `page`, `tempDir`, `createdAt`, `lastActivityAt`
- [ ] Implement `updateActivity()` to reset `lastActivityAt` to now
- [ ] Implement `navigate(url)`: call `page.goto(url, { waitUntil: "networkidle" })`, return final URL and title
- [ ] Implement `read()`: take full-page screenshot (save to `screenshots/screenshot-<timestamp>.png`), extract markdown from page HTML, extract interactive elements, return `ReadResponse`
- [ ] Implement `click(selector?, coords?)`: call `page.click(selector)` or `page.mouse.click(x, y)`, wait for `networkidle`
- [ ] Implement `type(selector, text)`: call `page.fill(selector, text)`
- [ ] Implement `scroll(direction, amount)`: call `page.evaluate` with `window.scrollBy`
- [ ] Implement `hover(selector?, coords?)`: call `page.hover(selector)` or `page.mouse.move(x, y)`
- [ ] Implement `upload(selector, filePath)`: call `page.setInputFiles(selector, filePath)`
- [ ] Implement `download(selector)`: set up `page.waitForEvent("download")`, click element, save file to `downloads/` with collision resolution
- [ ] Implement `wait(selector, timeout)`: call `page.waitForSelector(selector, { timeout })`
- [ ] Implement `destroy()`: close `page`, close `context`, delete temp dir recursively
- [ ] Add HTML-to-markdown conversion helper for `read()` that strips `<script>`, `<style>`, and hidden elements before conversion
- [ ] Add interactive elements extractor for `read()` querying `<a>`, `<button>`, `<input>`, `<textarea>`, `<select>`

### `src/session/SessionManager.ts`

- [ ] Define `SessionManager` class with `Map<string, BrowserSession>` and a shared Playwright `Browser` instance
- [ ] Implement `createSession()`: generate UUID v4, create `BrowserContext` (isolated), open `Page`, create temp dirs (`/tmp/browser-tool/<id>/screenshots/` and `.../downloads/`), register session, start idle timer, return session
- [ ] Implement `getSession(id)`: return session or throw structured `SESSION_NOT_FOUND` error
- [ ] Implement `destroySession(id)`: call `session.destroy()`, cancel idle timer, remove from map
- [ ] Implement idle timer logic: start a 1-hour `setTimeout` per session, call `destroySession` on expiry, reset timer on every command execution
- [ ] Implement `shutdown()`: destroy all active sessions, close the shared `Browser` instance

---

## 4. Daemon

### `src/daemon/server.ts`

- [ ] Create `/tmp/browser-tool/` directory on startup if it does not exist
- [ ] Start a Unix domain socket server at `/tmp/browser-tool/daemon.sock`
- [ ] Accept incoming connections and parse newline-delimited JSON command messages
- [ ] Dispatch each message to the appropriate command handler using `SessionManager`
- [ ] Serialise response (success or error) as JSON and write back to the socket connection
- [ ] Handle uncaught errors per connection without crashing the daemon
- [ ] Launch Playwright `Browser` (Chromium, headless) once on startup and pass to `SessionManager`
- [ ] Implement graceful shutdown: call `SessionManager.shutdown()` on `SIGTERM`/`SIGINT`
- [ ] Write daemon PID to `/tmp/browser-tool/daemon.pid` on startup; remove on exit

### `src/daemon/client.ts`

- [ ] Implement `sendCommand(command, args)`: connect to `/tmp/browser-tool/daemon.sock`, send JSON message, await JSON response, return parsed response
- [ ] Implement auto-start logic: if socket connection is refused, spawn the daemon process (`node dist/daemon/server.js`) and retry connection with backoff (up to 5 retries)
- [ ] Implement connection timeout: fail with `INVALID_ARGUMENTS` error if daemon does not respond within 10 seconds
- [ ] Ensure client process exits cleanly after receiving the response (does not hang open)

---

## 5. Command Handlers (`src/commands/`)

Each command handler receives validated args and a `SessionManager` instance, calls the appropriate `BrowserSession` method, and returns a typed response.

- [ ] `start.ts` — call `SessionManager.createSession()`, return `StartResponse`
- [ ] `navigate.ts` — resolve session, call `session.navigate(url)`, return `NavigateResponse`
- [ ] `read.ts` — resolve session, call `session.read()`, return `ReadResponse`
- [ ] `click.ts` — resolve session, validate `--selector` or `--coords` (not both, not neither), call `session.click(...)`, return `ActionResponse`
- [ ] `type.ts` — resolve session, call `session.type(selector, text)`, return `ActionResponse`
- [ ] `scroll.ts` — resolve session, default `amount` to `500` if omitted, call `session.scroll(direction, amount)`, return `ActionResponse`
- [ ] `hover.ts` — resolve session, validate `--selector` or `--coords`, call `session.hover(...)`, return `ActionResponse`
- [ ] `upload.ts` — resolve session, call `session.upload(selector, filePath)`, return `ActionResponse`
- [ ] `download.ts` — resolve session, call `session.download(selector)`, return `DownloadResponse`
- [ ] `wait.ts` — resolve session, default `timeout` to `30000` if omitted, call `session.wait(selector, timeout)`, return `ActionResponse`
- [ ] `close.ts` — resolve session, call `SessionManager.destroySession(id)`, return `CloseResponse`

---

## 6. CLI Entry Point (`src/cli.ts`)

- [ ] Set up CLI framework with top-level `browser-tool` command and all 11 subcommands
- [ ] Register all flags per command as specified in `commands.md`
- [ ] Validate required flags for each subcommand; output `INVALID_ARGUMENTS` JSON error and exit `1` on missing/invalid flags
- [ ] Forward validated args to `daemon/client.ts` `sendCommand`
- [ ] Print the JSON response from the daemon to stdout
- [ ] Exit with code `0` on success, `1` on error (detect via presence of `error` field in response)

---

## 7. Build & Distribution

- [ ] Verify `tsc` compiles without errors
- [ ] Verify `browser-tool start` runs end-to-end after `npm run build`
- [ ] Add `npm link` instructions to README (or `package.json` `prepare` script)
- [ ] Confirm binary is executable (`chmod +x dist/cli.js` or add shebang `#!/usr/bin/env node`)
