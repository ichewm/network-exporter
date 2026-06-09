# Network Exporter Privacy Policy

Last updated: 2026-06-09

Network Exporter is a Chrome DevTools extension for inspecting network requests and copying selected request data as JSON or Markdown.

## Data Processed By The Extension

When Chrome DevTools is open and the Network Exporter panel is used, the extension can display network request data made available by Chrome DevTools, including:

- Request URLs
- HTTP methods and status codes
- Request and response headers
- Request payloads
- Response bodies
- Timing, size, type, MIME type, and initiator metadata

This data may include personal or sensitive information depending on the websites or local applications you inspect.

## How Data Is Used

Network Exporter uses network request data only to provide its user-facing DevTools features:

- Displaying requests in the Network Exporter panel
- Showing details for a selected request
- Copying selected requests and selected fields to the clipboard when you click a copy button

## Data Collection And Transmission

Network Exporter does not collect, sell, transmit, or share your network request data with the developer or any third party.

The extension does not use remote servers, analytics, telemetry, advertising, or tracking. Data remains local to your browser session unless you explicitly copy it to your clipboard and paste it elsewhere.

## Sensitive Headers

Sensitive headers such as `Authorization`, `Cookie`, and `Set-Cookie` are excluded from exports by default. You can opt in to include sensitive headers when you explicitly need them.

## Permissions

Network Exporter requests only the `clipboardWrite` permission so it can copy selected exports to your clipboard after you click a copy button.

The extension does not request host permissions, `debugger`, `webRequest`, `tabs`, cookies, storage, or background network permissions.

## Chrome Web Store Limited Use Statement

Network Exporter's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the extension's single user-facing purpose: selecting, inspecting, and copying DevTools network request data locally.

## Contact

Use the support contact or project homepage listed on the Chrome Web Store item page.
