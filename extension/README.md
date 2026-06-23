# Network Exporter

Network Exporter is a local Chrome DevTools extension for selecting a small set of Network requests and copying focused exports. It is meant for debugging workflows where a full HAR file is too noisy.

## Current Features

- Adds a `Network Exporter` tab to Chrome DevTools.
- Captures requests with `chrome.devtools.network` as soon as DevTools opens.
- Supports local record/pause and clear controls.
- Supports a plugin-level `Preserve log` option for keeping captured requests across navigations.
- Supports filtering by free text, type chips, status groups, and invert.
- Supports an `Errors` status filter for 4xx, 5xx, and failed requests.
- Highlights 4xx, 5xx, and failed requests with distinct row colors.
- Shows visible-request error counts for 4xx, 5xx, and failed requests.
- Excludes browser extension requests by default, such as `chrome-extension://...`.
- Supports simple query filters:
  - `url:/api/users`
  - `method:post`
  - `status-code:4`
  - `domain:example.com`
  - `type:fetch`
  - `mime:json`
- Supports multi-selecting visible requests.
- Supports clicking one request row to inspect details.
- Supports choosing exported fields.
- Supports `Defaults` and `Full` field presets.
- Supports collapsing the export pane when table space is more important.
- Copies selected requests as JSON.
- Copies selected requests as Markdown.

## Request Details

Click a request row to inspect one request without changing the export checkbox selection.

Detail tabs:

- `Headers`
- `Payload`
- `Response`
- `Meta`

## Spec Documents

- `spec/00-requirements.md`
- `spec/01-target-result.md`
- `spec/02-acceptance-plan.md`
- `spec/03-audit-results.md`

## Local Checks

Run from the workspace root:

```bash
node --check extension/panel.js
node --check extension/devtools.js
node --check extension/shared.js
node extension/tests/00-panel-logic.test.js
```

## Install Locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `extension/` folder in this repository.

6. Open DevTools on any page.
7. Open the `Network Exporter` DevTools tab.
8. Reload the page or run the workflow you want to capture.

## Export Fields

Default fields:

- `curlRequest`
- `statusCode`
- `responseBody`
- `url`
- `method`

Optional fields include:

- `name`
- `type`
- `size`
- `time`
- `initiator`
- `requestHeaders`
- `requestBody`
- `responseHeaders`
- `mimeType`

Use `Full` when you want the selected requests to include every available export field, including request headers, request body, response headers, timing, size, type, MIME type, and initiator.

Sensitive headers such as `Authorization`, `Cookie`, and `Set-Cookie` are excluded by default. Enable `Include sensitive headers` only when you explicitly need them.

## Notes

- The extension does not upload data anywhere.
- It does not use the `debugger` permission.
- It does not modify Chrome's built-in Network panel.
- Open DevTools before running the workflow you want to capture. The extension starts listening when DevTools opens, even before the `Network Exporter` tab is selected.
- Enable `Preserve log` in Network Exporter when you want captured requests to survive reloads, redirects, or other navigations.
- Response body capture depends on DevTools seeing the request finish. If DevTools was opened after a request happened, reload the page.
- Existing requests loaded from `getHAR()` may not always include response body content; newly finished requests use `request.getContent()`.
