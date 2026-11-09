# Release Notes — 0.6.2

## Overview

v0.6.2 fixes a visual bug in the 0.6.1 field pills. No permission, storage, or export-format changes.

## What Changed

### Fix: Full preset left pills dimmed

Clicking **Full** checked every field but the pills stayed grayed-out with empty order badges. Cause: the handler sets `input.checked` programmatically, which fires no `change` event — and the badge/dimming refresh only ran from the change listener. The handler now refreshes the badges explicitly after selecting everything, so every pill immediately shows its number 1–14 with no dimming.

`Defaults` was unaffected (it already refreshed through the order-sync path).

## Test Coverage

`tests/09-export-field-order.test.js` gained a chips-aware mock harness (chips with badges and move buttons) and DOM-level assertions: fresh install numbering/dimming, Full numbers every pill and clears all dimming, Defaults restores 1–4 numbering and re-dims the rest. Verified the regression test fails without the fix. Total: 10 test files.

## Permissions

Unchanged. Still only `clipboardWrite`.

## Compatibility

Chrome 88+ (Manifest V3). Drop-in upgrade from 0.6.1.
