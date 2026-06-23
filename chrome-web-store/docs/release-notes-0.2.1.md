# Release Notes 0.2.1

Network Exporter 0.2.1 updates the DevTools capture lifecycle and refines the narrow-panel debugging workflow.

Included:

- Captures requests from the DevTools page lifecycle, so capture starts when DevTools opens instead of waiting for the custom panel to be selected
- Added a Network Exporter `Preserve log` option for retaining requests across reloads, redirects, and navigations
- Highlighted 4xx client errors, 5xx server errors, and failed requests with distinct row colors
- Added visible error counts for `Errors`, `4xx`, `5xx`, and `Failed`
- Added an `Errors` status filter for 4xx, 5xx, and failed requests
- Kept the URL table column while making data columns resize proportionally in narrow DevTools layouts
- Kept the selection checkbox column fixed so row selection remains usable when narrow
- Kept request detail tabs visible in narrow layouts
- Reduced the default export fields to `curlRequest`, `statusCode`, `responseBody`, and `method`
- Kept the extension permission set unchanged
