# Session Management Design

## Session Model

Each browser session is identified by a randomly generated `sessionId` (UUID v4). The agent
receives this ID from the `start` command and must pass it with every subsequent command.

Sessions are stored in an **in-memory map** within a long-lived Node.js process. This process
acts as the session host — the CLI commands communicate with it via IPC or direct in-process
calls depending on implementation approach (see Process Model below).

---

## Session Data Structure

```typescript
interface BrowserSession {
  id: string;                      // UUID v4
  context: playwright.BrowserContext;
  page: playwright.Page;
  tempDir: string;                 // /tmp/browser-tool/<id>/
  createdAt: Date;
  lastActivityAt: Date;            // Updated on every command
}
```

---

## Process Model

Because Playwright browser contexts are long-lived objects that cannot survive process
exit, a **daemon process** must hold them. The CLI commands are thin clients that communicate
with this daemon.

```
browser-tool start          ←→    Daemon process
browser-tool navigate ...   ←→    (holds all BrowserSession objects)
browser-tool click ...      ←→
browser-tool close ...      ←→
```

**Daemon startup**: The CLI auto-starts the daemon on first use if not already running.  
**Daemon socket**: Communicate via a Unix domain socket at `/tmp/browser-tool/daemon.sock`.  
**Daemon shutdown**: Daemon exits when all sessions are closed and no activity for a
configurable grace period.

---

## Session Lifecycle

```
start
  │
  ├─ Generate sessionId (UUID v4)
  ├─ Launch Playwright BrowserContext (Chromium, headless)
  ├─ Open a new Page within the context
  ├─ Create temp dir: /tmp/browser-tool/<sessionId>/
  │    ├── screenshots/
  │    └── downloads/
  ├─ Register session in in-memory map
  ├─ Start idle timer (1 hour)
  └─ Return { sessionId }

  [agent issues commands]
  │
  ├─ Each command resets the idle timer
  └─ Commands operate on the session's Page object

close (explicit) OR idle timeout
  │
  ├─ Close Playwright Page
  ├─ Close Playwright BrowserContext
  ├─ Delete temp dir recursively
  ├─ Remove session from in-memory map
  └─ Cancel idle timer
```

---

## Concurrency

Multiple sessions can exist simultaneously. Each session has its own:

- Playwright `BrowserContext` — isolated cookies, localStorage, cache
- Playwright `Page` — independent tab/navigation state
- Temp directory — separate screenshots and downloads

Sessions do not share state. There is no limit on concurrent sessions (resource constraints
are left to the host OS).

---

## Idle Timeout

- Default: **1 hour** of inactivity
- Every successful command execution resets the idle timer for that session
- On timeout: same cleanup sequence as explicit `close`
- Timeout will be made configurable via a CLI flag or config file in a future iteration

---

## Temp Directory Layout

```
/tmp/browser-tool/
├── daemon.sock               ← Unix socket for CLI↔daemon communication
├── <sessionId-1>/
│   ├── screenshots/
│   │   ├── screenshot-<timestamp>.png
│   │   └── screenshot-<timestamp>.png
│   └── downloads/
│       └── <filename>
└── <sessionId-2>/
    ├── screenshots/
    └── downloads/
```

Screenshots are named `screenshot-<unix-timestamp-ms>.png`.  
Downloaded files retain their original filename; collisions are resolved by appending a counter.

---

## Security Constraints

- **Downloads** are always saved inside `/tmp/browser-tool/<sessionId>/downloads/`. The tool
  must never write downloads outside this boundary.
- **Uploads** read from any local path the agent specifies (no restriction at this stage).
- No domain or URL restrictions are enforced at this stage.
