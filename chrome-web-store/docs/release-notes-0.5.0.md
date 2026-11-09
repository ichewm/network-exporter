# Release Notes — 0.5.0

## Overview

v0.5.0 adds panel settings persistence. User preferences now survive DevTools and browser restarts, mirroring how Chrome DevTools' own Network panel remembers long-lived preferences. No new permissions, no data-flow changes — the extension still only requests `clipboardWrite` and all data stays local.

## What Changed

### Panel settings are remembered

The following preferences are persisted to the extension's local `localStorage` (key `networkExporter.settings.v1`) and restored on the next DevTools session:

- Preserve log
- Invert filter
- Exclude extension requests
- Filter text (capped at 1000 characters)
- Active type chip (Fetch/XHR, Doc, CSS, JS, Font, Img, Media, Manifest, Socket, Wasm, Other)
- Status filter (2xx, 3xx, 4xx, 5xx, Failed, Errors)
- Export field selection
- Truncate large bodies toggle
- Collapsed/expanded export pane

Settings are written the moment the user changes them, and only after a user action — a fresh install performs no storage writes.

### Deliberately not persisted

Two states intentionally reset on every fresh DevTools session:

- **Record/pause state** — recording always restarts on, matching the session-scoped record toggle in Chrome's Network panel.
- **Include sensitive headers** — always restarts unchecked so a stale toggle can never silently leak `Cookie`/`Authorization` headers into later exports.

Captured requests, selection, and the inspected request remain session-only; the request log itself is never written to storage.

### Cross-window sync

If multiple DevTools windows are open, a preserve-log change in one window is picked up live by the others via the `storage` event (instead of only on next launch).

### Robustness

Persisted settings are validated against a whitelist on load: unknown type groups, status filters, and export fields are dropped; duplicated fields are de-duplicated; non-boolean toggles fall back to defaults; corrupt JSON falls back to factory defaults; an empty-after-sanitizing field list falls back to the default field set.

## Test Coverage

Added `tests/07-settings-persistence.test.js`: simulated restart restore, immediate persist on user action, corrupt and hostile storage sanitization, and devtools-store restore/cross-window-sync behavior.

Total: 8 test files.

## Permissions

Unchanged. Still only `clipboardWrite`. No `scripting`, no `host_permissions`, no `debugger`, no remote code. Settings never leave the device.

## Compatibility

Chrome 88+ (Manifest V3). Drop-in upgrade from 0.4.1; previously captured settings start from factory defaults.
