---
name: browser-tool
description: >
  Use this skill when you need to browse websites, interact with web pages, extract content,
  or perform multi-step web interactions. Supports both statically and dynamically rendered
  (JavaScript) pages. Can click, type, scroll, hover, upload and download files, and capture
  screenshots for visual content like graphs and image-heavy pages. Manages isolated browser
  sessions identified by a session ID. Use for tasks like: "go to this URL and fill out the
  form", "scrape data from this website", "log in and navigate to X", "download the report
  from this page".
allowed-tools: Bash
---

# Browser Tool

A CLI-based browser automation tool powered by Playwright (Chromium). Enables AI agents to
interact with any website — including JavaScript-rendered pages — like a human would.

## Core Concepts

- **Sessions**: Every interaction requires an active session. Start one with `start`, use the
  returned `sessionId` in all subsequent commands, and end it with `close`.
- **Output**: All commands return JSON to stdout. On failure, a JSON error object is returned
  with a non-zero exit code.
- **Element targeting**: Interactive elements (click, type, hover, upload) are identified by
  CSS selector or page coordinates `x,y`.
- **Page reading**: The `read` command returns the page as markdown text plus a screenshot path
  for visual content.
- **Screenshots**: Saved automatically to `/tmp/browser-tool/<sessionId>/`.
- **Idle timeout**: Sessions auto-close after 1 hour of inactivity.

## Workflow

Always follow this pattern:

1. `start` → get `sessionId`
2. `navigate` → go to target URL
3. `read` → understand the page (markdown + screenshot)
4. Act: `click`, `type`, `scroll`, `hover`, `upload`, `download`, `wait` as needed
5. `read` again to verify state after interactions
6. `close` → end session when done

For detailed command reference, see [commands.md](commands.md).
For worked examples, see [examples.md](examples.md).
