# Project Structure

## Repository Layout

```
browse-all/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                  ← Entry point; parses subcommands and dispatches
│   ├── daemon/
│   │   ├── server.ts           ← Unix socket server; hosts SessionManager
│   │   └── client.ts           ← Thin client used by CLI to talk to daemon
│   ├── session/
│   │   ├── SessionManager.ts   ← In-memory map of sessionId → BrowserSession
│   │   └── BrowserSession.ts   ← Wraps Playwright BrowserContext + Page
│   ├── commands/
│   │   ├── start.ts
│   │   ├── navigate.ts
│   │   ├── read.ts
│   │   ├── click.ts
│   │   ├── type.ts
│   │   ├── scroll.ts
│   │   ├── hover.ts
│   │   ├── upload.ts
│   │   ├── download.ts
│   │   ├── wait.ts
│   │   └── close.ts
│   └── types.ts                ← Shared TypeScript types (responses, errors)
└── dist/                       ← Compiled JS output (gitignored)
```

---

## Module Responsibilities

### `cli.ts`
- Parse `process.argv` for subcommand and flags
- Validate required flags; emit `INVALID_ARGUMENTS` error and exit non-zero if missing
- Forward parsed command to daemon client
- Print daemon response JSON to stdout
- Set process exit code based on response (0 = success, 1 = error)

### `daemon/server.ts`
- Start a Unix socket server at `/tmp/browser-tool/daemon.sock`
- Accept incoming command requests from CLI clients
- Delegate to `SessionManager`
- Return JSON responses over the socket
- Launch Playwright browser on first session start; keep it alive across sessions

### `daemon/client.ts`
- Connect to daemon socket
- Serialize command + args as JSON, send over socket
- Receive JSON response, return to CLI
- Auto-start daemon if socket not found

### `session/SessionManager.ts`
- Maintain `Map<string, BrowserSession>`
- `createSession()` → instantiate `BrowserSession`, register, start idle timer
- `getSession(id)` → return session or throw `SESSION_NOT_FOUND`
- `destroySession(id)` → cleanup session resources
- Enforce 1-hour idle timeout per session

### `session/BrowserSession.ts`
- Hold `BrowserContext`, `Page`, `tempDir`, `lastActivityAt`
- Expose methods for each browser action (`navigate`, `click`, etc.)
- Reset `lastActivityAt` on every method call

### `commands/*.ts`
- Each file exports a single function matching the command
- Receives validated args, calls `BrowserSession` methods
- Returns typed response object

### `types.ts`
- All shared interfaces: `BrowserSession`, `ErrorResponse`, `ErrorCode`,
  and per-command response types as defined in `commands.md`

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `playwright` | Browser automation (Chromium) |
| `uuid` | UUID v4 generation for session IDs |
| `turndown` or similar | HTML → Markdown conversion for `read` command |

---

## Build & Distribution

- Compile with `tsc` to `dist/`
- Entry point: `dist/cli.js`
- Installed globally via `npm install -g` or linked via `npm link`
- Binary name: `browser-tool`

---

## TypeScript Configuration

Key `tsconfig.json` settings:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  }
}
```
