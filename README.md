# Network Exporter

Network Exporter is a Chrome DevTools extension for selecting, inspecting, and copying focused network request exports.

It adds a `Network Exporter` tab to DevTools so developers can select a small set of requests, choose export fields, and copy clean JSON or Markdown without exporting a full HAR file.

## Features

- DevTools panel for local network inspection
- Multi-select request table
- Single-request details for headers, payload, response, and metadata
- Filters for URL text, method, status, domain, MIME type, and resource type
- Error filtering and counts for 4xx, 5xx, and failed requests
- Distinct row highlighting for client errors, server errors, and failed requests
- Default exclusion for noisy browser extension requests
- Field-level export controls
- Defaults and Full field presets
- Collapsible export pane for narrow DevTools layouts
- Copy selected requests as JSON
- Copy selected requests as Markdown
- Sensitive headers excluded by default

## Install Locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `extension/` folder in this repository.
6. Open DevTools on a page.
7. Open the `Network Exporter` tab.
8. Reload the page to capture requests.

## Chrome Web Store Package

The prepared Chrome Web Store package and listing materials are in:

```text
chrome-web-store/
```

The upload ZIP is:

```text
chrome-web-store/network-exporter-0.2.0.zip
```

## Privacy

Privacy policy:

```text
privacy-policy.md
```

Network Exporter does not use remote servers, analytics, background traffic capture, host permissions, or the `debugger` permission. Network data is processed locally inside the DevTools panel and copied only when the user explicitly clicks a copy button.

## Validation

Run from the repository root:

```bash
node --check extension/panel.js
node --check extension/devtools.js
node extension/tests/00-panel-logic.test.js
```

## License

No license has been selected yet.
