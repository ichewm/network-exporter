# Release Notes — 0.6.0

## Overview

v0.6.0 adds user-configurable export field ordering. Fields can be reordered in the export pane and the order drives the JSON key order and Markdown section order of exports. No new permissions, no data-flow changes — the extension still only requests `clipboardWrite` and all data stays local.

Implements #1.

## What Changed

### Reorderable export fields

The field list is now a wrapping grid of field chips, each with two interaction modes:

- **← → buttons** — click to move a field one step earlier or later. Natively keyboard-accessible and touch-friendly; the first field's ← and the last field's → are disabled.
- **Drag & drop** — press and drag a chip for long-distance moves in one gesture, with a drop indicator line. Available wherever HTML5 drag works (desktop); everywhere else the buttons cover it. A press without movement never starts a drag, so checkbox clicks are unaffected.

Both gestures funnel into a single reorder primitive; moving a field to its current position writes nothing.

### Export order follows the UI

- JSON exports emit keys in the user's field order; Markdown exports emit `### field` sections in the same order.
- Only the **checked fields' relative order** is persisted (it rides the existing `exportFields` setting — no storage schema change). Unchecked field positions are session cosmetics and fall back to canonical order on restart.
- `Defaults` resets both the default field set and the canonical order. `Full` selects every field but keeps the current order.
- Settings written by 0.5.x load unchanged; the stored export order is honored as-is.

## Test Coverage

Added `tests/09-export-field-order.test.js`: button and drag reordering, boundary no-ops (no storage writes), index clamping, JSON key order and Markdown section order, restart restore (checked order preserved, unchecked canonical tail), preset semantics, and field-set integrity after reordering.

Total: 10 test files.

## Permissions

Unchanged. Still only `clipboardWrite`.

## Compatibility

Chrome 88+ (Manifest V3). Drop-in upgrade from 0.5.1.
