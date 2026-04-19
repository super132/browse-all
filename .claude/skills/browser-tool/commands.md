# Command Specifications

## CLI Contract

```
browser-tool <command> [--session <sessionId>] [options]
```

- All output is JSON to **stdout**
- On success: exit code `0`, JSON success payload
- On failure: non-zero exit code, JSON error payload (see [Error Format](#error-format))
- The `--session` flag is required on all commands except `start`

---

## Error Format

```typescript
interface ErrorResponse {
  error: string;     // Human-readable message
  code: ErrorCode;   // Machine-readable code
}

type ErrorCode =
  | "SESSION_NOT_FOUND"    // sessionId does not exist or has expired
  | "NAVIGATION_FAILED"    // URL could not be loaded
  | "ELEMENT_NOT_FOUND"    // CSS selector matched nothing
  | "TIMEOUT"              // Action exceeded wait limit
  | "DOWNLOAD_FAILED"      // Download did not complete
  | "UPLOAD_FAILED"        // Upload failed (bad path or selector)
  | "INVALID_ARGUMENTS";   // Missing or malformed flags
```

---

## Commands

### `start`

Launches a new Playwright BrowserContext and Page. Returns a session ID.

**Flags:** none

**Implementation steps:**
1. Generate UUID v4 as `sessionId`
2. Launch Playwright Chromium in headless mode
3. Create `BrowserContext` (isolated — no shared cookies/storage)
4. Open a `Page` within the context
5. Create temp dirs: `/tmp/browser-tool/<sessionId>/screenshots/` and `.../downloads/`
6. Register session in daemon's session map
7. Start 1-hour idle timer

**Output:**
```typescript
interface StartResponse {
  sessionId: string;
  message: "Session started";
}
```

---

### `navigate`

Navigates the session's page to a URL. Waits for `networkidle` before returning.

**Flags:**
- `--url <string>` (required) — full URL including scheme

**Implementation steps:**
1. Call `page.goto(url, { waitUntil: "networkidle" })`
2. Return page title and final URL (after any redirects)

**Output:**
```typescript
interface NavigateResponse {
  sessionId: string;
  url: string;    // final URL after redirects
  title: string;
}
```

---

### `read`

Captures the current page state: markdown content, interactive elements, and a screenshot.

**Flags:** none beyond `--session`

**Implementation steps:**
1. Take a full-page screenshot → save to `/tmp/browser-tool/<sessionId>/screenshots/screenshot-<timestamp>.png`
2. Extract page content:
   - Convert visible DOM text to markdown (headings, paragraphs, lists, tables)
   - Strip `<script>`, `<style>`, and hidden elements
3. Extract interactive elements via DOM query:
   - `<a>` → `{ type: "link", text, href, selector }`
   - `<button>` → `{ type: "button", text, selector }`
   - `<input>`, `<textarea>`, `<select>` → `{ type: "input", name, inputType, selector }`
4. Return combined payload

**Output:**
```typescript
interface ReadResponse {
  sessionId: string;
  url: string;
  title: string;
  markdown: string;
  screenshotPath: string;
  interactiveElements: InteractiveElement[];
}

type InteractiveElement =
  | { type: "link";   text: string; href: string;      selector: string }
  | { type: "button"; text: string;                    selector: string }
  | { type: "input";  name: string; inputType: string; selector: string };
```

---

### `click`

Clicks a DOM element or page coordinate. Waits for `networkidle` after click.

**Flags (mutually exclusive):**
- `--selector <string>` — CSS selector
- `--coords <x>,<y>` — page coordinates (integers)

**Implementation steps:**
1. If `--selector`: call `page.click(selector)`
2. If `--coords`: call `page.mouse.click(x, y)`
3. Wait for `networkidle`

**Output:**
```typescript
interface ActionResponse {
  sessionId: string;
  action: "click";
  target: string;   // selector string or "x,y"
}
```

---

### `type`

Types text into an input element. Clears existing value first.

**Flags:**
- `--selector <string>` (required) — CSS selector of the input
- `--text <string>` (required) — text to type

**Implementation steps:**
1. Call `page.fill(selector, text)` — clears field and types atomically

**Output:**
```typescript
interface ActionResponse {
  sessionId: string;
  action: "type";
  target: string;
  text: string;
}
```

---

### `scroll`

Scrolls the page viewport.

**Flags:**
- `--direction <"up"|"down">` (required)
- `--amount <number>` (optional, default: `500`) — pixels to scroll

**Implementation steps:**
1. Call `page.evaluate((amount, dir) => window.scrollBy(0, dir === "down" ? amount : -amount), amount, direction)`

**Output:**
```typescript
interface ActionResponse {
  sessionId: string;
  action: "scroll";
  direction: "up" | "down";
  amount: number;
}
```

---

### `hover`

Moves the mouse over an element or coordinate, triggering hover states.

**Flags (mutually exclusive):**
- `--selector <string>` — CSS selector
- `--coords <x>,<y>` — page coordinates

**Implementation steps:**
1. If `--selector`: call `page.hover(selector)`
2. If `--coords`: call `page.mouse.move(x, y)`

**Output:**
```typescript
interface ActionResponse {
  sessionId: string;
  action: "hover";
  target: string;
}
```

---

### `upload`

Sets a file on a `<input type="file">` element.

**Flags:**
- `--selector <string>` (required) — CSS selector of the file input
- `--file <string>` (required) — absolute path to the local file

**Implementation steps:**
1. Call `page.setInputFiles(selector, filePath)`

**Output:**
```typescript
interface ActionResponse {
  sessionId: string;
  action: "upload";
  target: string;
  file: string;
}
```

---

### `download`

Triggers a download by clicking an element and captures the resulting file.

**Flags:**
- `--selector <string>` (required) — CSS selector of the download trigger

**Implementation steps:**
1. Set up Playwright download listener: `page.waitForEvent("download")`
2. Click the element to trigger the download
3. Await the download event
4. Save file to `/tmp/browser-tool/<sessionId>/downloads/<filename>`
5. Resolve filename collisions by appending `_<counter>` before extension

**Output:**
```typescript
interface DownloadResponse {
  sessionId: string;
  action: "download";
  filePath: string;   // absolute path under session temp dir
  fileName: string;
}
```

---

### `wait`

Waits for a CSS selector to appear in the DOM.

**Flags:**
- `--selector <string>` (required) — CSS selector to wait for
- `--timeout <number>` (optional, default: `30000`) — max wait in milliseconds

**Implementation steps:**
1. Call `page.waitForSelector(selector, { timeout })`

**Output:**
```typescript
interface ActionResponse {
  sessionId: string;
  action: "wait";
  selector: string;
}
```

---

### `close`

Ends the session and releases all resources.

**Flags:** none beyond `--session`

**Implementation steps:**
1. Close `Page`
2. Close `BrowserContext`
3. Delete temp dir recursively
4. Remove session from in-memory map
5. Cancel idle timer

**Output:**
```typescript
interface CloseResponse {
  sessionId: string;
  message: "Session closed";
}
```
