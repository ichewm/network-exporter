# Release Notes — 0.5.1

## Overview

v0.5.1 fixes copy failures in embedded environments. No new permissions, no data-flow changes — the extension still only requests `clipboardWrite` and all data stays local.

## What Changed

### Clipboard fallback for embedded DevTools

Some users reported that clicking Copy failed with:

```text
Failed to execute 'writeText' on 'Clipboard': The Clipboard API has been
blocked because of a permissions policy applied to the current document.
```

**Cause:** the panel runs as a cross-origin iframe inside the DevTools frontend. In a standalone DevTools window Chrome allows the async Clipboard API, but when DevTools itself is embedded in another container — an IDE webview such as VS Code's browser preview, or remote-debugging frontends — the `clipboard-write` Permissions-Policy is never delegated down the iframe chain, and `navigator.clipboard.writeText()` is blocked. Recent Chrome versions tightened enforcement of these policies in nested iframes, which is why this started surfacing now.

**Fix:** when the async Clipboard API fails, the panel retries via the legacy synchronous `document.execCommand("copy")` path (hidden off-screen textarea inside a user gesture). That path is not governed by the Permissions-Policy above and works in exactly the environments where the modern API is blocked.

Behavior:

- Healthy environments: unchanged — the async Clipboard API is used; the fallback never runs.
- Policy-blocked environments: copy now succeeds via the fallback; success feedback is identical.
- If both paths fail: the copy-failed status is shown, exactly as before — never worse.

`document.execCommand` is deprecated, but it is a pure fallback: if browsers ever remove it, behavior degrades to the pre-0.5.1 state, not further.

## Test Coverage

Added `tests/08-clipboard-fallback.test.js`: healthy-path isolation (fallback never runs), policy-blocked rescue (exact error text simulated, export text verified against the fallback textarea, DOM cleanup verified), both-paths-fail (execCommand false/throw), Markdown fallback, and direct helper-drive cases.

Total: 9 test files.

## Permissions

Unchanged. Still only `clipboardWrite`. The `execCommand` fallback is a plain DOM call that requires no permission and adds no manifest entries, so no new store permission declarations are needed.

## Compatibility

Chrome 88+ (Manifest V3). Drop-in upgrade from 0.5.0.
