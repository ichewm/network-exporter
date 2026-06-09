# Audit Results

## Scope

This audit checks the current implementation against:

- `spec/00-requirements.md`
- `spec/01-target-result.md`
- `spec/02-acceptance-plan.md`

## Issues Found And Fixed

### 1. No automated logic smoke test

The project had static checks, but no zero-dependency automated check for filtering, selected-field exports, sensitive header handling, cURL generation, response decoding, or Markdown formatting.

Fix:

- Added `tests/00-panel-logic.test.js`.
- Added the test command to `README.md`.
- Added the test command to `spec/02-acceptance-plan.md`.

### 2. Panel could fail outside DevTools during local smoke checks

`panel.js` assumed `chrome.devtools.network` existed at load time. That is correct inside DevTools, but made local rendering checks brittle and could show a blank panel if opened as a normal HTML file.

Fix:

- Added a DevTools API guard.
- The panel now binds UI and renders an empty state when opened outside DevTools.
- The capture path still uses `chrome.devtools.network` when available.

### 3. Fallback request ids could collapse repeated matching requests

The original fallback id was based on timestamp, method, URL, status, and time. Repeated identical requests could theoretically collapse into one row.

Fix:

- Prefer Chrome's `_requestId` when available.
- Add a monotonic fallback sequence when `_requestId` is absent.

### 4. Base64 response body was exported without decoding

If Chrome DevTools returns response content with `base64` encoding, the previous implementation exported the base64 string directly.

Fix:

- Decode base64 response content with `TextDecoder`.
- Fall back to the raw response body if decoding fails.

### 5. Markdown code fences could break on fenced response content

Response bodies or cURL strings that contain triple backticks could break Markdown output.

Fix:

- Added dynamic Markdown fences that are longer than any backtick run inside the content.

### 6. Testable implementation evidence was missing

Several requirements were implemented but not easy to prove from commands.

Fix:

- Exposed a small `NetworkExporterInternals` object for local tests.
- Covered normalization, HAR hydration, live request finish handling, `getContent()` response body capture, filtering, export fields, sensitive header omission, sensitive opt-in, base64 decoding, and Markdown fence safety.

### 7. Exported samples were noisy and looked incomplete

An observed Markdown export contained a very large `chrome-extension://.../default_config.content.json` response from another installed browser extension. That response dominated the clipboard output and made the selected business requests harder to inspect. The default field preset also exported only the core five fields, which can look incomplete when the user wants request metadata, headers, request body, response headers, size, time, and type in one copy.

Fix:

- Added `Exclude extensions`, enabled by default.
- Added a `Full` field preset that selects all export fields.
- Registered the live request listener before HAR hydration to reduce the chance of missing requests while the panel opens.

### 8. Export pane was squeezed in narrow DevTools layouts

When DevTools is docked on the right side with a narrow width, the fixed right-side Export pane could be squeezed into an unusably narrow column.

Fix:

- Removed the global minimum page width.
- Kept the right-side Export pane for wide layouts.
- Moved Export into a bottom pane under `980px` viewport width.
- Arranged field checkboxes into responsive columns in the bottom pane.
- Kept copy buttons full-width on wide layouts and two-column on narrow bottom-pane layouts.

Verification:

- Captured a `900x760` smoke screenshot where Export appears as a bottom pane.
- Captured a `1280x760` smoke screenshot where Export remains a right-side pane.

### 9. No Chrome Network-like single-request details

The table supported selecting requests for export, but clicking one request did not show a detail view similar to Chrome's Network panel.

Fix:

- Added a request detail pane under the request table.
- Added `Headers`, `Payload`, `Response`, and `Meta` tabs.
- Changed row click behavior to inspect a request instead of toggling export selection.
- Kept checkbox selection as the only export selection action.
- Added detail formatting coverage to `tests/00-panel-logic.test.js`.

## Verification Performed

Run from the workspace root:

```bash
node --check outputs/network-exporter-extension/panel.js
node --check outputs/network-exporter-extension/devtools.js
node -e "JSON.parse(require('fs').readFileSync('outputs/network-exporter-extension/manifest.json','utf8')); console.log('manifest-ok')"
node outputs/network-exporter-extension/tests/00-panel-logic.test.js
```

Observed:

```text
manifest-ok
panel-logic-ok
```

Chrome package check:

```bash
rm -rf work/pack-src work/pack-src.crx work/pack-src.pem
cp -R outputs/network-exporter-extension work/pack-src
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --pack-extension="$(pwd)/work/pack-src"
test -s work/pack-src.crx
test -s work/pack-src.pem
```

Observed:

```text
package-ok
```

UI smoke check:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --window-size=1280,800 \
  --user-data-dir="$(pwd)/work/panel-smoke-profile" \
  --screenshot="$(pwd)/work/panel-smoke.png" \
  "file://$(pwd)/outputs/network-exporter-extension/panel.html"
```

Observed:

- Toolbar rendered.
- Type chips rendered.
- Request table rendered.
- Export field checkboxes rendered.
- JSON and Markdown copy buttons rendered.
- Empty-state message rendered when not inside DevTools.

## Requirement Status

- DevTools panel named `Network Exporter`: satisfied by `manifest.json` and `devtools.js`.
- Capture through `chrome.devtools.network`: satisfied by `panel.js`.
- Similar request table: satisfied by `panel.html` and `panel.css`.
- Multi-select and select-visible: satisfied by `panel.js` and covered by logic structure.
- Pause/resume capture: satisfied by `isRecording` handling in `panel.js`.
- Clear captured requests: satisfied by `clearRequests` handling in `panel.js`.
- Filtering: satisfied by free-text, type chips, status filter, invert, and query syntax in `panel.js`.
- Extension request exclusion: satisfied by `Exclude extensions` and covered by `tests/00-panel-logic.test.js`.
- Field selection: satisfied by field checkboxes in `panel.html` and export field extraction in `panel.js`.
- Full export preset: satisfied by `Full` in `panel.html` and `panel.js`.
- Copy JSON and Markdown only: satisfied by `copyJson`, `copyMarkdown`, and absence of download APIs.
- Sensitive headers excluded by default: satisfied by `filterHeaders` and covered by `tests/00-panel-logic.test.js`.
- No `debugger` permission: satisfied by `manifest.json`.
- No build step or npm dependency: satisfied by plain HTML, CSS, JS, and Node standard-library tests.

## Remaining Manual Check

The only remaining check that cannot be fully proven without interacting with the user's installed Chrome DevTools UI is the manual installed extension flow:

- Load unpacked extension through `chrome://extensions`.
- Open DevTools.
- Confirm `Network Exporter` tab appears.
- Reload a target page and confirm live requests populate.
- Copy selected JSON or Markdown from the clipboard.

The Chrome package check proves that Chrome accepts the extension structure, but it does not replace the final manual DevTools interaction.
