# Scrollywood 🎬

One-click smooth scroll video recording for any webpage. Capture beautiful, cinematic scroll recordings with an Art Deco-inspired interface.

## Features

- **One-click recording**: Just set duration and click "Action"
- **Smooth scrolling**: Configurable scroll duration (5-300 seconds)
- **Delay before roll**: Optional countdown before scrolling starts
- **Auto-save**: Downloads as WebM when complete
- **Visual feedback**: "REC" badge shows recording status

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)
1. Clone this repository
2. Run `bun install`
3. Open `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the `Scrollywood` folder

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Build extension ZIP for distribution
bun run build
```

## Publishing to Chrome Web Store

### First-time setup

1. **Create a developer account** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - One-time $5 registration fee

2. **Create OAuth credentials** for automated publishing:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable the Chrome Web Store API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Note the Client ID and Client Secret

3. **Get a refresh token**:
   ```bash
   # Use the Chrome Web Store API OAuth flow
   # Visit: https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```

4. **Add secrets to GitHub**:
   - `CHROME_EXTENSION_ID`: Your extension's ID (after first manual upload)
   - `CHROME_CLIENT_ID`: OAuth client ID
   - `CHROME_CLIENT_SECRET`: OAuth client secret
   - `CHROME_REFRESH_TOKEN`: OAuth refresh token

### Manual publishing

1. Build the extension: `bun run build`
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Upload `dist/scrollywood-v*.zip`
4. Fill out store listing details
5. Submit for review (typically 1-3 days)

### Automated publishing (via CI)

Push a version tag to trigger automatic publishing:

```bash
# Update version in manifest.json
git tag v1.0.1
git push origin v1.0.1
```

## Architecture

```
Scrollywood/
├── manifest.json          # Extension manifest (MV3)
├── popup.html/js          # Extension popup UI
├── background.js          # Service worker (orchestration)
├── background-logic.js    # Testable business logic
├── offscreen.html/js      # MediaRecorder (needs DOM context)
├── scroll-utils.js        # Scroll calculation utilities
└── scripts/build.js       # Build script for packaging
```

### Why offscreen document?

Chrome Manifest V3 service workers don't have DOM access, but `MediaRecorder` requires it. The offscreen document provides a DOM context for video recording while the service worker handles orchestration.

### Popup testing

For debugging or automation, the popup can target a specific tab when opened directly:

```text
chrome-extension://<extension-id>/popup.html?tab=<tab-id>
```

Without the `tab` query param, the popup falls back to the current active tab.

## License

MIT
