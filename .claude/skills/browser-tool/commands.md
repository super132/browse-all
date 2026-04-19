# Browser Tool — Command Reference

All commands follow the pattern:
```
browser-tool <command> [options]
```

All output is JSON to stdout. On error, exit code is non-zero and output is:
```json
{ "error": "<message>", "code": "<ERROR_CODE>" }
```

---

## `start`

Start a new browser session. Always call this first.

```
browser-tool start
```

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "message": "Session started"
}
```

---

## `navigate`

Navigate to a URL. Waits for network idle before returning.

```
browser-tool navigate --session <sessionId> --url <url>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID from `start` |
| `--url` | Yes | Full URL including scheme (https://) |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "url": "https://example.com",
  "title": "Example Domain"
}
```

---

## `read`

Capture the current page state as markdown text and a screenshot.

```
browser-tool read --session <sessionId>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "url": "https://example.com",
  "title": "Example Domain",
  "markdown": "# Example Domain\n\nThis domain is for use in ...",
  "screenshotPath": "/tmp/browser-tool/a1b2c3d4/screenshot-1713500000.png",
  "interactiveElements": [
    { "type": "link", "text": "More information", "href": "https://iana.org/domains/reserved", "selector": "a" },
    { "type": "button", "text": "Submit", "selector": "#submit-btn" },
    { "type": "input", "name": "email", "inputType": "email", "selector": "#email-input" }
  ]
}
```

> Use `screenshotPath` to view visual content (graphs, images, charts) that cannot be
> represented in markdown.

---

## `click`

Click an element on the page.

```
browser-tool click --session <sessionId> --selector <css-selector>
browser-tool click --session <sessionId> --coords <x>,<y>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--selector` | One of | CSS selector of the element to click |
| `--coords` | One of | Page coordinates as `x,y` (useful for canvas/visual elements) |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "click",
  "target": "#submit-btn"
}
```

---

## `type`

Type text into a focused input field. Use `click` to focus the field first.

```
browser-tool type --session <sessionId> --selector <css-selector> --text <text>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--selector` | Yes | CSS selector of the input field |
| `--text` | Yes | Text to type |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "type",
  "target": "#email-input",
  "text": "user@example.com"
}
```

---

## `scroll`

Scroll the page up or down.

```
browser-tool scroll --session <sessionId> --direction <up|down> [--amount <pixels>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--direction` | Yes | `up` or `down` |
| `--amount` | No | Pixels to scroll (default: 500) |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "scroll",
  "direction": "down",
  "amount": 500
}
```

---

## `hover`

Move the mouse over an element (triggers hover states, tooltips, dropdowns).

```
browser-tool hover --session <sessionId> --selector <css-selector>
browser-tool hover --session <sessionId> --coords <x>,<y>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--selector` | One of | CSS selector of element to hover |
| `--coords` | One of | Page coordinates as `x,y` |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "hover",
  "target": "#menu-item"
}
```

---

## `upload`

Upload a file to a file input element.

```
browser-tool upload --session <sessionId> --selector <css-selector> --file <local-file-path>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--selector` | Yes | CSS selector of the `<input type="file">` element |
| `--file` | Yes | Absolute path to the local file to upload |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "upload",
  "target": "#file-input",
  "file": "/home/user/documents/report.pdf"
}
```

---

## `download`

Trigger a file download and save it to the session's temp directory.

```
browser-tool download --session <sessionId> --selector <css-selector>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--selector` | Yes | CSS selector of the download link or button |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "download",
  "filePath": "/tmp/browser-tool/a1b2c3d4/downloads/report.pdf",
  "fileName": "report.pdf"
}
```

---

## `wait`

Wait for an element to appear in the DOM before proceeding.

```
browser-tool wait --session <sessionId> --selector <css-selector> [--timeout <ms>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID |
| `--selector` | Yes | CSS selector of element to wait for |
| `--timeout` | No | Max wait time in milliseconds (default: 30000) |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "action": "wait",
  "selector": "#results-table"
}
```

---

## `close`

End the session and release all resources (browser context, temp files).

```
browser-tool close --session <sessionId>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--session` | Yes | Session ID to close |

**Output:**
```json
{
  "sessionId": "a1b2c3d4",
  "message": "Session closed"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | The provided session ID does not exist or has expired |
| `NAVIGATION_FAILED` | Could not load the URL (DNS failure, timeout, etc.) |
| `ELEMENT_NOT_FOUND` | CSS selector matched no element on the page |
| `TIMEOUT` | Action exceeded the wait timeout |
| `DOWNLOAD_FAILED` | File download did not complete |
| `UPLOAD_FAILED` | File upload failed (file not found, wrong selector) |
| `INVALID_ARGUMENTS` | Missing or invalid command arguments |
