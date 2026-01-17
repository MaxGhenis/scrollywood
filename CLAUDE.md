# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Scrollywood is a Chrome extension (Manifest V3) that captures smooth scroll video recordings of webpages. Users set a duration, click "Action", and the extension records a WebM video as the page auto-scrolls.

## Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Build extension ZIP for Chrome Web Store
bun run build
```

## Loading the extension for development

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder

## Architecture

The extension uses Manifest V3's offscreen document pattern to work around service worker limitations:

```
popup.js          → User clicks "Action" → sends message to service worker
     ↓
background.js     → Orchestrates recording:
                    1. Scrolls tab to top
                    2. Gets media stream ID via tabCapture API
                    3. Creates offscreen document
                    4. Sends stream ID to offscreen document
     ↓
offscreen.js      → Has DOM context, so can use MediaRecorder:
                    1. Captures tab video stream
                    2. Waits for delay, then requests scroll injection
                    3. Records for duration + 2s buffer
                    4. Converts blob to base64, sends back to service worker
     ↓
background.js     → Downloads video via chrome.downloads API
```

**Why offscreen document?** MV3 service workers lack DOM access, but `MediaRecorder` requires it. The offscreen document provides the DOM context while the service worker handles Chrome API calls that require extension context (`scripting.executeScript`, `downloads.download`).

### Key files

- **background-logic.js**: Testable business logic extracted from the service worker (badge management, offscreen setup, recording state)
- **scroll-utils.js**: Pure functions for scroll calculations, used in tests
- **scripts/build.js**: Packages extension files into a ZIP for distribution

## Testing

Tests use Vitest with mocked Chrome APIs. The pattern:

```javascript
// Mock Chrome APIs globally
const mockChrome = { tabs: { query: vi.fn() }, ... };
global.chrome = mockChrome;

// Import after mocking
import { functionToTest } from './file.js';
```

Business logic is extracted into separate files (`background-logic.js`, `scroll-utils.js`) to enable testing without the full extension context.

## Chrome API permissions used

- `activeTab` / `scripting`: Inject scroll script into current tab
- `tabCapture`: Capture tab video stream
- `offscreen`: Create offscreen document for MediaRecorder
- `downloads`: Save recorded video
