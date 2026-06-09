# Requirements

## Product Shape

Network Exporter is a local Chrome DevTools Extension. It adds a separate `Network Exporter` tab inside DevTools instead of modifying Chrome's built-in Network panel.

## User Problem

Chrome DevTools can copy a request as cURL and can copy responses separately, but it is awkward when the user only wants a few selected requests with a small set of fields such as cURL, status code, response body, type, size, or time.

Full HAR exports contain too much data and often include sensitive headers. Generic third-party network extensions can be too broad for debugging private API traffic.

## Core Requirements

- Provide a DevTools panel named `Network Exporter`.
- Capture requests visible to DevTools through `chrome.devtools.network`.
- Show requests in a table similar to the Network panel.
- Support clicking a single request row to inspect request details.
- Support selecting multiple requests with checkboxes.
- Support selecting all currently visible requests.
- Support pausing and resuming local capture.
- Support clearing captured requests.
- Support filtering requests before selection.
- Exclude browser extension requests by default, with a user-visible opt-out.
- Support choosing which fields are exported.
- Support choosing either default export fields or all available export fields.
- Support copying selected requests as JSON.
- Support copying selected requests as Markdown.
- Do not require a download/export file workflow.

## Request Detail Requirements

The detail view must not replace multi-select export behavior. Clicking a row changes the inspected request. Checkboxes control export selection.

The detail view must include:

- Headers
- Payload
- Response
- Meta

## Filtering Requirements

The panel must support these first-pass filters:

- Free-text search across URL, name, method, status, domain, type, MIME type, and initiator.
- Resource type chips:
  - `All`
  - `Fetch/XHR`
  - `Doc`
  - `CSS`
  - `JS`
  - `Font`
  - `Img`
  - `Media`
  - `Manifest`
  - `Socket`
  - `Wasm`
  - `Other`
- Status group filter:
  - Any status
  - `2xx`
  - `3xx`
  - `4xx`
  - `5xx`
  - Failed
- Invert filter toggle.
- Browser extension request exclusion toggle.
- Simple query syntax:
  - `url:/api/users`
  - `method:post`
  - `status-code:4`
  - `domain:example.com`
  - `type:fetch`
  - `mime:json`

## Export Field Requirements

Default export fields:

- `curlRequest`
- `statusCode`
- `responseBody`
- `url`
- `method`

Optional export fields:

- `name`
- `type`
- `size`
- `time`
- `initiator`
- `requestHeaders`
- `requestBody`
- `responseHeaders`
- `mimeType`

## Security Requirements

- Do not upload captured request data anywhere.
- Do not use the `debugger` permission in the first version.
- Do not include sensitive headers by default.
- Exclude these sensitive header names unless the user explicitly opts in:
  - `Authorization`
  - `Cookie`
  - `Set-Cookie`
  - `X-API-Key`
  - `X-Auth-Token`
  - `X-CSRF-Token`
  - `XSRF-Token`

## Non-Goals

- Do not modify Chrome's native Network panel.
- Do not implement file download in the first version.
- Do not implement remote storage or cloud sync.
- Do not capture traffic before DevTools is opened.
- Do not use a proxy, local certificate, or MITM capture flow.
- Do not require npm install or a build step for local use.
