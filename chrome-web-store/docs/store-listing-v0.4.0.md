# Chrome Web Store Listing Draft — v0.4.0

## Name

Network Exporter

## Summary

Select DevTools network requests and copy focused JSON or Markdown exports. Multilingual.

## Category

Developer Tools

## Languages

English, 简体中文, 日本語, 한국어, Deutsch, Français (auto-follows browser UI)

## Detailed Description

Network Exporter adds a focused panel to Chrome DevTools for copying only the network requests and fields you actually need — no full HAR dumps, no copy-pasting one request at a time.

Select a few requests, pick the fields, and copy clean JSON or Markdown straight to your clipboard. Sensitive headers are stripped by default. Large bodies are auto-truncated. The UI adapts to your browser language.

### What it does

- Adds a "Network Exporter" tab inside Chrome DevTools.
- Captures requests visible to DevTools (starts the moment DevTools opens).
- Multi-select table with checkboxes and "select all visible".
- Request detail tabs: Headers, Payload, Response, Meta.
- Filters: free-text search, resource-type chips (Fetch/XHR, Doc, JS, CSS, Img, Font, Media, Manifest, Socket, Wasm, Other), status groups (2xx–5xx, Failed, Errors), invert, and a query syntax (`url:`, `method:`, `status:`, `domain:`, `type:`, `mime:`).
- Distinct row highlighting + counts for client errors, server errors, and failed requests.
- Browser-extension requests excluded by default (toggleable).
- Export fields you choose: cURL, status, response body, method, URL, name, type, size, time, initiator, request/response headers, request body, MIME type.
- "Defaults" and "Full" presets for field selection.
- Copy as JSON or Markdown — feedback shows payload size and an estimated token count, color-coded by context budget.
- Large response/request bodies are truncated at 256 kB with a visible marker (toggleable).
- Binary responses export as a placeholder, not mojibake.
- Sensitive headers (Authorization, Cookie, Set-Cookie, X-API-Key, X-Auth-Token, X-CSRF-Token, XSRF-Token) excluded unless you explicitly opt in.
- Preserve log across reloads and navigations.
- Pause/resume recording.
- Responsive layout for narrow DevTools windows.
- UI available in English, Chinese (Simplified), Japanese, Korean, German, and French — follows your browser automatically.

### Built for

- Debugging API workflows without full HAR noise.
- Preparing focused bug reports.
- Sharing minimal reproducible request examples.
- Pasting compact context into LLMs and dev tools.

### Privacy & security

- No remote servers. No analytics. No background traffic capture.
- No host permissions. No `debugger` permission.
- All network data is processed locally inside the DevTools panel.
- Data leaves your machine only when you select requests and click Copy.

## Single-line description (store "description" field)

Select network requests in DevTools and copy focused JSON or Markdown exports — with multilingual UI, automatic large-body truncation, and sensitive-header redaction.

## Short value proposition

Copy only the network requests and fields you need, in the language you use.

## Suggested keywords

DevTools, Network, API debugging, cURL, HAR alternative, JSON export, Markdown export, request inspector, developer tools, i18n

## Support URL

Use your project homepage, GitHub repository, or support page URL.

## Privacy Policy URL

Host `docs/privacy-policy.md` somewhere public and use that URL.

## Screenshot assets

- `listing-assets/screenshots/network-exporter-main-1280x800.png`

## Promotional assets

- `listing-assets/icon-128.png`
- `listing-assets/promotional/network-exporter-small-promo-440x280.png`
- `listing-assets/promotional/network-exporter-top-tile-1400x560.png`

## Single permission justification (for review)

`clipboardWrite` — required so the "Copy as JSON" and "Copy as Markdown" buttons can write the export to the system clipboard. No other permissions are requested. No host permissions, no `scripting`, no `debugger`, no remote code.
