# Release Notes 0.2.0

Network Exporter 0.2.0 improves error-focused debugging workflows in the DevTools panel.

Included:

- Highlighted 4xx client errors, 5xx server errors, and failed requests with distinct row colors
- Added visible error counts for `Errors`, `4xx`, `5xx`, and `Failed`
- Added an `Errors` status filter for 4xx, 5xx, and failed requests
- Moved request capture into the DevTools page so capture starts as soon as DevTools opens
- Added a Network Exporter `Preserve log` option for retaining requests across navigations
- Added lightweight status color indicators in the request table summary
- Added a collapsible export pane to give the request table more room in narrow DevTools layouts
- Kept the URL table column while making all request table columns resize proportionally in narrow DevTools layouts
- Kept the extension permission set unchanged
