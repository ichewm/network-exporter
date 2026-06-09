# Acceptance Plan

## Static Checks

Run from the workspace root:

```bash
node --check outputs/network-exporter-extension/panel.js
node --check outputs/network-exporter-extension/devtools.js
node -e "JSON.parse(require('fs').readFileSync('outputs/network-exporter-extension/manifest.json','utf8')); console.log('manifest-ok')"
node outputs/network-exporter-extension/tests/00-panel-logic.test.js
```

Expected result:

- Both JavaScript files pass syntax checks.
- Manifest JSON parses and prints `manifest-ok`.
- Logic smoke test prints `panel-logic-ok`.

## Chrome Package Check

Run from the workspace root:

```bash
rm -rf work/pack-src work/pack-src.crx work/pack-src.pem
cp -R outputs/network-exporter-extension work/pack-src
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --pack-extension="$(pwd)/work/pack-src"
```

Expected result:

- Chrome exits successfully.
- `work/pack-src.crx` is created.
- `work/pack-src.pem` is created.

Cleanup:

```bash
rm -rf work/pack-src work/pack-src.crx work/pack-src.pem
```

## Manual Install Check

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select:

   ```text
   /Users/hewm/Documents/Codex/2026-06-08/chrome-dev-tools-network-capy-as/outputs/network-exporter-extension
   ```

Expected result:

- Chrome loads the extension without manifest errors.
- Extension name appears as `Network Exporter`.

## DevTools Panel Check

1. Open any normal web page.
2. Open DevTools.
3. Look at the DevTools tab list.

Expected result:

- A `Network Exporter` tab is visible.
- Opening the tab shows the request table and export options.

## Capture Check

1. Open the `Network Exporter` DevTools tab.
2. Reload the inspected page.
3. Wait for requests to finish.

Expected result:

- Requests appear in the table.
- Each visible request shows at least name, method, status, type, size, time, and URL where available.

## Filter Check

Use several filters against the captured requests:

- Free text such as `api`.
- Type chip such as `Fetch/XHR`.
- Status group such as `2xx`.
- Query syntax such as `method:get`, `status-code:2`, or `url:/api`.
- Invert toggle.
- Extension exclusion toggle using a `chrome-extension://...` request if available.

Expected result:

- Request table updates based on the selected filter.
- Select-all applies only to visible filtered requests.
- Browser extension requests are hidden by default and visible when extension exclusion is disabled.

## Multi-Select Check

1. Select two or more visible requests.
2. Deselect one selected request.
3. Use select-all on a filtered list.

Expected result:

- Row highlight and checkbox state stay consistent.
- Selected count updates correctly.
- Selection persists when filters are changed unless the user clears requests.

## Request Detail Check

1. Click a request row, not the checkbox.
2. Open each detail tab:
   - `Headers`
   - `Payload`
   - `Response`
   - `Meta`

Expected result:

- Clicking a row changes the inspected request.
- Clicking a row does not toggle export selection.
- `Headers` shows general metadata plus request and response headers.
- `Payload` shows request body, or a no-payload message.
- `Response` shows response body, or a no-response message.
- `Meta` shows structured request metadata.

## JSON Export Check

1. Select at least one request.
2. Keep default fields selected.
3. Click `Copy selected as JSON`.
4. Paste clipboard into a text editor.

Expected result:

- Clipboard contains a JSON array.
- Each object contains default fields:
  - `curlRequest`
  - `statusCode`
  - `responseBody`
  - `url`
  - `method`
- Non-selected requests are not included.

## Markdown Export Check

1. Select at least one request.
2. Select fields such as `curlRequest`, `statusCode`, `responseBody`, and `responseHeaders`.
3. Click `Copy selected as Markdown`.
4. Paste clipboard into a Markdown editor.

Expected result:

- Clipboard contains one `## Request N` section per selected request.
- Object fields such as headers render as fenced JSON blocks.
- Body and cURL fields render as fenced text blocks.

## Full Preset Check

1. Select at least one request.
2. Click `Full`.
3. Click `Copy selected as JSON`.
4. Paste clipboard into a text editor.

Expected result:

- Clipboard contains all available export fields, including optional metadata such as `type`, `size`, `time`, `initiator`, headers, request body, response body, and MIME type.

## Sensitive Header Check

1. Select a request that contains sensitive headers if available.
2. Export with `requestHeaders` or `responseHeaders` selected.
3. Leave `Include sensitive headers` unchecked.
4. Copy JSON.
5. Repeat with `Include sensitive headers` checked.

Expected result:

- By default, sensitive header names are omitted.
- When opt-in is checked, sensitive header names are included.

## Known Acceptance Boundaries

- Requests made before DevTools opens may be missing. Reload the page before judging capture completeness.
- Response body availability depends on Chrome DevTools API behavior and request timing.
- The extension does not provide a download button by design.
- Native Chrome Network panel behavior is unchanged by design.
