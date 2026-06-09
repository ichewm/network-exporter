# Permission Justification

## `clipboardWrite`

Network Exporter uses `clipboardWrite` only after the user clicks one of these explicit buttons:

- `Copy selected as JSON`
- `Copy selected as Markdown`

The extension does not write to the clipboard automatically.

## Permissions Not Requested

Network Exporter intentionally does not request:

- Host permissions
- `debugger`
- `webRequest`
- `tabs`
- `cookies`
- `storage`
- Background service worker permissions

This keeps the extension aligned with Chrome Web Store minimum-permission guidance.
