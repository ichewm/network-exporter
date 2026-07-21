# Release Notes — 0.4.1

## Overview

v0.4.1 is a small interaction fix. No new permissions, no new features, no data-flow changes — the extension still only requests `clipboardWrite` and all data stays local.

## What Changed

### Selection clears when a filter changes

Previously the request selection was "sticky" across filter changes: requests selected under **All** stayed selected after switching to a type chip (e.g. Fetch/XHR), and the "select all" checkbox in the narrower view could only toggle the *visible* rows — so selections made under All could never be cleared from a filtered view.

Now changing **any** filter clears the current selection:

- Type chip (Fetch/XHR, Doc, JS, CSS, Font, Img, Media, Manifest, Socket, Wasm, Other)
- Status filter (2xx, 3xx, 4xx, 5xx, Failed, Errors)
- Search box
- Invert toggle
- Exclude-extensions toggle

"Select all" itself is unchanged — it is a selection action, not a filter, and still fills the selection for the currently visible rows.

## Test Coverage

Added `tests/06-filter-clears-selection.test.js`, which fires each filter's real event handler end-to-end and asserts the selection is cleared. Includes regressions for `select-all` (must fill, not clear) and capture clearing (must still drop stale selections).

Total: 7 test files.

## Permissions

Unchanged. Still only `clipboardWrite`. No `scripting`, no `host_permissions`, no `debugger`, no remote code.

## Compatibility

Chrome 88+ (Manifest V3). Drop-in upgrade from 0.4.0.
