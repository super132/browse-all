---
name: browser-tool
description: >
  Technical design for a CLI-based browser automation tool that enables AI agents to browse
  and interact with any website — including JavaScript-rendered pages — like a human would.
  Use this skill when implementing, extending, or debugging the browser-tool. Covers
  architecture, tech stack, design decisions, session model, CLI contract, output format,
  error handling, and resource management.
allowed-tools: Bash Read Write Edit Glob Grep
---

# Browser Tool — Technical Design

## Goal

A CLI tool that allows AI agents to browse and interact with websites (static and
JavaScript-rendered) through a sequence of commands. Agents issue commands like a human
would: navigate, read the page, click elements, type text, scroll, hover, upload/download
files.

---

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Type safety; Playwright's native language |
| Browser engine | Playwright (Chromium) | Best-in-class JS rendering; rich automation API |
| CLI framework | To be decided during implementation | Should parse subcommands and flags |
| Runtime | Node.js | Required by Playwright/TypeScript |

---

## Architecture Overview

```
Agent (Claude)
    │
    │  CLI invocation: browser-tool <command> [options]
    ▼
┌─────────────────────────────────────────────┐
│                 CLI Layer                   │
│  Parse subcommand + flags → dispatch        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│             Session Manager                 │
│  In-memory map: sessionId → BrowserSession  │
│  Idle timeout enforcement (1 hour)          │
│  Concurrent session support                 │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│            Browser Session                  │
│  Playwright BrowserContext + Page           │
│  Temp directory: /tmp/browser-tool/<id>/    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│          Playwright (Chromium)              │
└─────────────────────────────────────────────┘
```

---

## Core Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session model | Session ID passed per invocation | Explicit state; supports concurrent sessions; fits agent tool-call pattern |
| Concurrency | Multiple sessions in-memory simultaneously | Each session is an isolated Playwright BrowserContext |
| Wait strategy | `networkidle` by default | Catches most async/lazy-loaded content |
| Element targeting | CSS selector or `x,y` coordinates | CSS for DOM elements; coordinates for canvas/visual elements |
| Output format | JSON to stdout | Machine-readable; easy for agents to parse |
| Error signalling | Non-zero exit code + JSON error on stdout | Agent detects failure via exit code; reads detail from JSON |
| Screenshots | Saved to temp dir; path returned in JSON | Supports multimodal agents handling visual content (graphs, charts) |
| Page content | Rendered as markdown + interactive elements list | Text model-friendly; actionable element inventory |
| Authentication | No persistence; each session starts fresh | Simplicity; agent performs login via commands if needed |
| Downloads | Restricted to `/tmp/browser-tool/<sessionId>/downloads/` | Security boundary; predictable path for agent |
| Idle timeout | 1 hour (hardcoded default, configurable later) | Prevents resource leaks from abandoned sessions |
| Session cleanup | Explicit `close` command + idle timeout | Belt-and-suspenders resource management |

---

## Detailed design

For session lifecycle and management, see [session-management.md](session-management.md).
For command contracts (inputs, outputs, errors), see [commands.md](commands.md).
For project file and directory layout, see [project-structure.md](project-structure.md).
