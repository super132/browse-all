# Browser Tool — Examples

## Example 1: Read a webpage

```bash
# Start session
browser-tool start
# → { "sessionId": "a1b2c3d4" }

# Navigate
browser-tool navigate --session a1b2c3d4 --url https://news.ycombinator.com

# Read the page
browser-tool read --session a1b2c3d4
# → { "markdown": "# Hacker News\n...", "screenshotPath": "/tmp/...", "interactiveElements": [...] }

# Done
browser-tool close --session a1b2c3d4
```

---

## Example 2: Fill and submit a form

```bash
browser-tool start
# → { "sessionId": "b2c3d4e5" }

browser-tool navigate --session b2c3d4e5 --url https://example.com/contact

# Read to find the form field selectors
browser-tool read --session b2c3d4e5

# Type into the name field
browser-tool type --session b2c3d4e5 --selector "#name" --text "Jane Doe"

# Type into the email field
browser-tool type --session b2c3d4e5 --selector "#email" --text "jane@example.com"

# Click submit
browser-tool click --session b2c3d4e5 --selector "#submit-btn"

# Wait for confirmation element
browser-tool wait --session b2c3d4e5 --selector ".success-message"

# Read to verify success
browser-tool read --session b2c3d4e5

browser-tool close --session b2c3d4e5
```

---

## Example 3: Interact with a dropdown menu (hover)

```bash
browser-tool start
# → { "sessionId": "c3d4e5f6" }

browser-tool navigate --session c3d4e5f6 --url https://example.com

# Hover to reveal dropdown
browser-tool hover --session c3d4e5f6 --selector "#nav-products"

# Read to see revealed menu items
browser-tool read --session c3d4e5f6

# Click a menu item
browser-tool click --session c3d4e5f6 --selector "#nav-products-pricing"

browser-tool close --session c3d4e5f6
```

---

## Example 4: Download a file

```bash
browser-tool start
# → { "sessionId": "d4e5f6g7" }

browser-tool navigate --session d4e5f6g7 --url https://example.com/reports

# Click the download button
browser-tool download --session d4e5f6g7 --selector "#download-annual-report"
# → { "filePath": "/tmp/browser-tool/d4e5f6g7/downloads/annual-report.pdf" }

browser-tool close --session d4e5f6g7
```

---

## Example 5: Upload a file

```bash
browser-tool start
# → { "sessionId": "e5f6g7h8" }

browser-tool navigate --session e5f6g7h8 --url https://example.com/upload

# Upload a local file
browser-tool upload --session e5f6g7h8 --selector "input[type='file']" --file /home/user/docs/resume.pdf

# Click submit after upload
browser-tool click --session e5f6g7h8 --selector "#upload-submit"

# Verify upload success
browser-tool wait --session e5f6g7h8 --selector ".upload-complete"
browser-tool read --session e5f6g7h8

browser-tool close --session e5f6g7h8
```

---

## Example 6: Handle a visual page (graphs/charts)

```bash
browser-tool start
# → { "sessionId": "f6g7h8i9" }

browser-tool navigate --session f6g7h8i9 --url https://example.com/dashboard

# Read returns a screenshotPath for visual analysis
browser-tool read --session f6g7h8i9
# → { "screenshotPath": "/tmp/browser-tool/f6g7h8i9/screenshot-123.png", ... }
# Use the screenshot to analyse charts, graphs, or any visual content

# Click on a chart element using coordinates from the screenshot
browser-tool click --session f6g7h8i9 --coords 450,320

browser-tool close --session f6g7h8i9
```

---

## Example 7: Scroll to load more content

```bash
browser-tool start
# → { "sessionId": "g7h8i9j0" }

browser-tool navigate --session g7h8i9j0 --url https://example.com/feed

# Read initial content
browser-tool read --session g7h8i9j0

# Scroll down to trigger lazy-loaded content
browser-tool scroll --session g7h8i9j0 --direction down --amount 1000

# Wait for new content to load
browser-tool wait --session g7h8i9j0 --selector ".new-items-loaded"

# Read again to capture new content
browser-tool read --session g7h8i9j0

browser-tool close --session g7h8i9j0
```
