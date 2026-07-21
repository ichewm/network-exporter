# Release Notes — 0.4.0

## Overview

v0.4.0 is a quality and accessibility release. No new permissions have been added — the extension still only requests `clipboardWrite`. All data stays local. This release hardens request/response body handling, adds error resilience, expands test coverage, and introduces full internationalization.

## What's New

### Internationalization (6 languages)

The panel UI now follows your browser language automatically. Supported locales:

- English (default)
- 简体中文 (zh-CN)
- 日本語 (ja)
- 한국어 (ko)
- Deutsch (de)
- Français (fr)

Language is controlled via `chrome.i18n` + `_locales/`; there is no in-panel language switcher.

### Robust body handling

- Large response and request bodies are now truncated at 256 kB during export, with a visible `[truncated, original N bytes]` marker. A new "Truncate large bodies" checkbox (on by default) controls this.
- Binary responses (images, fonts, wasm, octet-stream, etc.) are no longer force-decoded into mojibake; they export as `[binary response: <mime>, <size>]`.
- Invalid base64 bodies degrade gracefully instead of surfacing raw garbage.
- Captured bodies stored in memory are clamped at 5 MB to keep the panel responsive on heavy pages.

### Error resilience

- Malformed or unusual network entries can no longer crash capture. Bad entries become visible error placeholders inside the request list instead of silently dropping.
- The clipboard export pipeline now wraps the build phase, so a construction failure shows a clear status message instead of an uncaught exception.
- `Extension context invalidated` (seen after reloading/updating the extension while DevTools is open) no longer kills the panel; i18n falls back to raw keys.

### Responsive detail tabs

The Headers / Payload / Response / Meta tabs no longer disappear in narrow DevTools layouts. They now shrink proportionally with the request title, and the title hides first on very narrow widths.

## Test coverage

Added three new test suites:

- `01-body-robustness.test.js` — truncation, binary MIME handling, base64 edge cases, shell quoting.
- `02-error-paths.test.js` — poisoned entries, throwing `getContent`, malformed HAR hydration, formatter boundaries, duplicate headers.
- `03-shared-normalizers.test.js` — URL parsing, resource type guessing from MIME, size fallbacks, initiator shapes.
- `04-i18n-and-export.test.js` — all 14 export fields, cURL generation, Markdown structure, i18n key pass-through.
- `05-filters-and-detail.test.js` — every status bucket, all 7 exact filter syntaxes, all 4 detail tabs.

Total: 6 files, 316 assertions.

## Permissions

Unchanged. Still only `clipboardWrite`. No `scripting`, no `host_permissions`, no `debugger`, no remote code.

## Compatibility

Chrome 88+ (Manifest V3). Existing user settings continue to work; this is a drop-in upgrade.
