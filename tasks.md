# Implementation Tasks

Tasks are ordered by dependency — complete each group before moving to the next.

---

## 1. Project Scaffolding

- [ ] Initialise `package.json` with name `browser-tool`, version `0.1.0`, and `"type": "commonjs"`
- [ ] Add `bin` field pointing to `dist/cli.js` with binary name `browser-tool`
- [ ] Add `scripts`: `build` (`tsc`), `dev` (`ts-node src/cli.ts`), `clean` (`rm -rf dist`), `test` (`jest`), `test:coverage` (`jest --coverage`), `lint` (`eslint src/**/*.ts`)
- [ ] Create `tsconfig.json` with `target: ES2020`, `module: commonjs`, `outDir: ./dist`, `strict: true`, `esModuleInterop: true`
- [ ] Install runtime dependencies: `playwright`, `uuid`
- [ ] Install dev dependencies: `typescript`, `ts-node`, `@types/node`, `@types/uuid`, `jest`, `ts-jest`, `@types/jest`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
- [ ] Install Playwright Chromium browser: `npx playwright install chromium`
- [ ] Add `dist/`, `node_modules/`, and `coverage/` to `.gitignore`
- [ ] Select and install an HTML-to-markdown library (e.g. `turndown` + `@types/turndown`)
- [ ] Select and install a CLI argument parsing library (e.g. `commander` or `yargs`)
- [ ] Configure Jest in `jest.config.js`: use `ts-jest` preset, `testEnvironment: node`, collect coverage from `src/**/*.ts`
- [ ] Configure ESLint in `.eslintrc.json`: `@typescript-eslint` recommended rules, `no-console` rule set to `warn` (stderr logging via a logger is preferred)

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
- [ ] Define `CommandRequest` interface used for daemon socket messages: `{ command: string; sessionId?: string; args: Record<string, unknown> }`

---

## 3. Session Layer

### `src/session/BrowserSession.ts`

- [ ] Define `BrowserSession` class holding `id`, `context`, `page`, `tempDir`, `createdAt`, `lastActivityAt`
- [ ] Implement `updateActivity()` to reset `lastActivityAt` to now
- [ ] Implement `navigate(url)`: validate URL format before calling Playwright; call `page.goto(url, { waitUntil: "networkidle" })`, return final URL and title; map Playwright `net::ERR_*` errors to `NAVIGATION_FAILED`
- [ ] Implement `read()`: take full-page screenshot (save to `screenshots/screenshot-<timestamp>.png`), extract markdown from page HTML, extract interactive elements, return `ReadResponse`
- [ ] Implement `click(selector?, coords?)`: call `page.click(selector)` or `page.mouse.click(x, y)`, wait for `networkidle`; map Playwright timeout/not-found errors to `ELEMENT_NOT_FOUND` or `TIMEOUT`
- [ ] Implement `type(selector, text)`: call `page.fill(selector, text)`; map selector errors to `ELEMENT_NOT_FOUND`
- [ ] Implement `scroll(direction, amount)`: call `page.evaluate` with `window.scrollBy`
- [ ] Implement `hover(selector?, coords?)`: call `page.hover(selector)` or `page.mouse.move(x, y)`; map selector errors to `ELEMENT_NOT_FOUND`
- [ ] Implement `upload(selector, filePath)`: verify `filePath` exists on disk before calling `page.setInputFiles`; throw `UPLOAD_FAILED` if file missing
- [ ] Implement `download(selector)`: set up `page.waitForEvent("download")`, click element, save file to `downloads/` with collision resolution (append `_<counter>` before extension); throw `DOWNLOAD_FAILED` on timeout
- [ ] Implement `wait(selector, timeout)`: call `page.waitForSelector(selector, { timeout })`; map timeout error to `TIMEOUT`
- [ ] Implement `destroy()`: close `page`, close `context`, delete temp dir recursively; swallow errors during cleanup so destroy never throws
- [ ] Add HTML-to-markdown conversion helper for `read()` that strips `<script>`, `<style>`, and hidden elements before conversion
- [ ] Add interactive elements extractor for `read()` querying `<a>`, `<button>`, `<input>`, `<textarea>`, `<select>`
- [ ] Add centralised Playwright error mapper: translate Playwright error messages to typed `ErrorCode` values

### `src/session/SessionManager.ts`

- [ ] Define `SessionManager` class with `Map<string, BrowserSession>` and a shared Playwright `Browser` instance
- [ ] Implement `createSession()`: generate UUID v4, create `BrowserContext` (isolated), open `Page`, create temp dirs (`/tmp/browser-tool/<id>/screenshots/` and `.../downloads/`), register session, start idle timer, return session
- [ ] Implement `getSession(id)`: return session or throw structured `SESSION_NOT_FOUND` error
- [ ] Implement `destroySession(id)`: call `session.destroy()`, cancel idle timer, remove from map; no-op if session not found
- [ ] Implement idle timer logic: start a 1-hour `setTimeout` per session, call `destroySession` on expiry, reset timer on every command execution
- [ ] Implement `shutdown()`: destroy all active sessions, close the shared `Browser` instance
- [ ] Clean up stale temp directories under `/tmp/browser-tool/` that have no matching active session on daemon startup

---

## 4. Daemon

### `src/daemon/server.ts`

- [ ] Create `/tmp/browser-tool/` directory on startup if it does not exist
- [ ] Remove stale `daemon.sock` file on startup if it exists but is not connectable (handles previous crash)
- [ ] Start a Unix domain socket server at `/tmp/browser-tool/daemon.sock`
- [ ] Accept incoming connections and parse newline-delimited JSON command messages
- [ ] Dispatch each message to the appropriate command handler using `SessionManager`
- [ ] Serialise response (success or error) as JSON and write back to the socket connection
- [ ] Handle uncaught errors per connection without crashing the daemon; return `ErrorResponse` instead
- [ ] Handle malformed JSON messages: return `INVALID_ARGUMENTS` error without crashing
- [ ] Launch Playwright `Browser` (Chromium, headless) once on startup and pass to `SessionManager`
- [ ] Implement graceful shutdown: call `SessionManager.shutdown()` on `SIGTERM`/`SIGINT`, then remove `daemon.sock` and `daemon.pid`
- [ ] Write daemon PID to `/tmp/browser-tool/daemon.pid` on startup; remove on exit
- [ ] Log lifecycle events (startup, shutdown, session create/destroy, errors) to stderr using a structured logger; never write to stdout (reserved for CLI JSON output)

### `src/daemon/client.ts`

- [ ] Implement `sendCommand(command, args)`: connect to `/tmp/browser-tool/daemon.sock`, send newline-delimited JSON message, await JSON response, return parsed response
- [ ] Implement auto-start logic: if socket connection is refused, spawn the daemon process (`node dist/daemon/server.js`) detached and retry connection with exponential backoff (up to 5 retries: 100ms, 200ms, 400ms, 800ms, 1600ms)
- [ ] Implement connection timeout: fail with `INVALID_ARGUMENTS` error if daemon does not respond within 10 seconds
- [ ] Ensure client process exits cleanly after receiving the response (does not hang open)
- [ ] Handle daemon response that is not valid JSON: surface as an internal error with descriptive message

---

## 5. Command Handlers (`src/commands/`)

Each command handler receives validated args and a `SessionManager` instance, calls the appropriate `BrowserSession` method, and returns a typed response.

- [ ] `start.ts` — call `SessionManager.createSession()`, return `StartResponse`
- [ ] `navigate.ts` — resolve session, call `session.navigate(url)`, return `NavigateResponse`
- [ ] `read.ts` — resolve session, call `session.read()`, return `ReadResponse`
- [ ] `click.ts` — resolve session, validate exactly one of `--selector` or `--coords` is provided, parse `--coords` as two integers, call `session.click(...)`, return `ActionResponse`
- [ ] `type.ts` — resolve session, call `session.type(selector, text)`, return `ActionResponse`
- [ ] `scroll.ts` — resolve session, default `amount` to `500` if omitted, validate `amount` is a positive integer, call `session.scroll(direction, amount)`, return `ActionResponse`
- [ ] `hover.ts` — resolve session, validate exactly one of `--selector` or `--coords`, call `session.hover(...)`, return `ActionResponse`
- [ ] `upload.ts` — resolve session, call `session.upload(selector, filePath)`, return `ActionResponse`
- [ ] `download.ts` — resolve session, call `session.download(selector)`, return `DownloadResponse`
- [ ] `wait.ts` — resolve session, default `timeout` to `30000` if omitted, validate `timeout` is a positive integer, call `session.wait(selector, timeout)`, return `ActionResponse`
- [ ] `close.ts` — resolve session, call `SessionManager.destroySession(id)`, return `CloseResponse`

---

## 6. CLI Entry Point (`src/cli.ts`)

- [ ] Set up CLI framework with top-level `browser-tool` command and all 11 subcommands
- [ ] Register all flags per command as specified in `commands.md`
- [ ] Validate required flags for each subcommand; output `INVALID_ARGUMENTS` JSON error and exit `1` on missing/invalid flags
- [ ] Forward validated args to `daemon/client.ts` `sendCommand`
- [ ] Print the JSON response from the daemon to stdout
- [ ] Exit with code `0` on success, `1` on error (detect via presence of `error` field in response)
- [ ] Add shebang `#!/usr/bin/env node` as first line of `cli.ts` so compiled output is directly executable

---

## 7. Build & Distribution

- [ ] Verify `tsc` compiles without errors and with zero `any` escapes
- [ ] Verify `browser-tool start` runs end-to-end after `npm run build`
- [ ] Confirm binary is executable (`chmod +x dist/cli.js`)
- [ ] Add `prepare` script to `package.json` that runs `npm run build` automatically on `npm install`
- [ ] Document install steps in `README.md`: `npm install`, `npx playwright install chromium`, `npm link`

---

## 8. Testing

### 8.1 Test Infrastructure

- [ ] Create `src/__tests__/` directory for unit tests and `src/__tests__/integration/` for integration tests
- [ ] Create a local test HTTP server fixture (`src/__tests__/fixtures/server.ts`) that serves static and JS-rendered HTML pages for use in integration and E2E tests
- [ ] Create test HTML fixtures: a static page, a JS-rendered page (content injected after 500ms), a form page, a page with a file download link, and a page with hover-triggered dropdown

### 8.2 Unit Tests — Session Layer

- [ ] `BrowserSession.test.ts` — mock `playwright.BrowserContext` and `playwright.Page`; test `navigate` maps Playwright errors to `NAVIGATION_FAILED`; test `click` maps timeout to `TIMEOUT` and missing selector to `ELEMENT_NOT_FOUND`; test `upload` throws `UPLOAD_FAILED` for non-existent file path; test `download` resolves filename collisions correctly; test `destroy` swallows errors from `page.close()` and `context.close()`
- [ ] `SessionManager.test.ts` — test `createSession` generates unique UUIDs and creates temp dirs; test `getSession` throws `SESSION_NOT_FOUND` for unknown ID; test `destroySession` calls `session.destroy()` and removes session from map; test `destroySession` is a no-op for unknown IDs; test idle timer fires `destroySession` after timeout; test that each command resets the idle timer

### 8.3 Unit Tests — Daemon

- [ ] `daemon/server.test.ts` — test malformed JSON input returns `INVALID_ARGUMENTS` without crashing; test unknown command returns `INVALID_ARGUMENTS`; test each command is dispatched to the correct handler; test per-connection errors do not crash the server process
- [ ] `daemon/client.test.ts` — test `sendCommand` serialises and deserialises correctly; test auto-start spawns daemon when socket is absent; test connection timeout returns error after 10 seconds; test client disconnects cleanly after response

### 8.4 Unit Tests — Command Handlers

- [ ] Test each command handler in `src/commands/` with a mocked `SessionManager`: verify correct method is called with correct arguments, verify response shape matches the defined interface, verify `SESSION_NOT_FOUND` is propagated when session is missing
- [ ] `click.test.ts` — additionally test that providing both `--selector` and `--coords` returns `INVALID_ARGUMENTS`; test that providing neither returns `INVALID_ARGUMENTS`
- [ ] `scroll.test.ts` — test `amount` defaults to `500`; test non-integer `amount` returns `INVALID_ARGUMENTS`
- [ ] `wait.test.ts` — test `timeout` defaults to `30000`; test non-integer `timeout` returns `INVALID_ARGUMENTS`

### 8.5 Unit Tests — CLI

- [ ] `cli.test.ts` — test each subcommand passes correct args to `sendCommand`; test missing required flags produce `INVALID_ARGUMENTS` JSON on stdout and exit code `1`; test successful response is printed to stdout and exits `0`; test error response exits `1`

### 8.6 Integration Tests

- [ ] Start the local test HTTP server and daemon before the integration test suite; stop both after
- [ ] `navigate.integration.test.ts` — navigate to static test page; assert `url` and `title` in response match the fixture
- [ ] `read.integration.test.ts` — navigate to static test page; call `read`; assert `markdown` contains expected headings; assert `screenshotPath` file exists on disk; assert `interactiveElements` contains the links and inputs present in the fixture
- [ ] `read-dynamic.integration.test.ts` — navigate to the JS-rendered fixture page; call `read`; assert dynamically injected content appears in `markdown` (validates `networkidle` wait strategy)
- [ ] `click.integration.test.ts` — navigate to form fixture; click submit button by selector; assert page navigates to success URL
- [ ] `type.integration.test.ts` — navigate to form fixture; type into an input; read page; assert input value is reflected in the DOM
- [ ] `scroll.integration.test.ts` — navigate to a long page fixture; scroll down; assert `scrollY` changed (via `page.evaluate`)
- [ ] `hover.integration.test.ts` — navigate to hover fixture; hover over menu item; read page; assert dropdown content is visible in `markdown`
- [ ] `upload.integration.test.ts` — navigate to upload fixture; upload a temp file; assert server receives the file
- [ ] `download.integration.test.ts` — navigate to download fixture; trigger download; assert `filePath` exists under session temp dir and file is non-empty
- [ ] `wait.integration.test.ts` — navigate to JS-rendered fixture; call `wait` for the dynamically injected selector; assert it resolves before `networkidle` would
- [ ] `session-lifecycle.integration.test.ts` — start session, run commands, close session; assert temp dir is deleted after close; assert subsequent commands with that session ID return `SESSION_NOT_FOUND`
- [ ] `concurrent-sessions.integration.test.ts` — start two sessions simultaneously; navigate each to different URLs; assert `read` on each returns the correct distinct content; close both

### 8.7 End-to-End Tests (CLI Binary)

- [ ] `e2e.test.ts` — after `npm run build`, invoke `browser-tool` binary via `child_process.execSync` for each subcommand; assert stdout is valid JSON; assert exit codes are correct for success and error cases

---

## 9. Code Quality

- [ ] Ensure `npm run lint` passes with zero errors
- [ ] Ensure `tsc --noEmit` passes (no type errors)
- [ ] Ensure `npm run test:coverage` achieves ≥ 80% line coverage across `src/`
- [ ] Ensure no `@ts-ignore` or `as any` casts exist in production code (`src/` excluding `__tests__/`)
