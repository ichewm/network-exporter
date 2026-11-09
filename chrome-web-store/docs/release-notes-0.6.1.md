# Release Notes — 0.6.1

## Overview

v0.6.1 refines the field-ordering UI introduced in 0.6.0: field pills now carry numbered order badges, and chip drag & drop was removed in favor of the buttons. No permission, storage, or export-format changes — the extension still only requests `clipboardWrite` and all data stays local.

## What Changed

### Numbered order pills

Each field is now a bordered pill with a small ordinal badge. Checked fields are numbered 1, 2, 3… — exactly the order their keys/sections appear in JSON and Markdown exports. Unchecked fields are dimmed and unnumbered (the badge keeps its space so pill edges stay aligned).

Why: a wrapping multi-column grid is spatially two-dimensional, so arrows alone conflated "earlier/later in the export" with "left/right on screen" (a move often jumped rows). The numbers carry the sequence meaning explicitly; every button click renumbers visibly and predictably.

### Drag & drop removed

The 0.6.0 chip drag suffered from the same geometry problem — dropping into a specific position in a wrapping grid is hard to read. With numbered pills, ← → buttons are fully deterministic (one click = one position), keyboard- and touch-accessible, and the long-distance case is simply a few more clicks. This also removes the entire dragstart/dragover/drop/dragend edge-case surface.

### Unchanged from 0.6.0

- JSON keys and Markdown sections follow the checked fields' order.
- Only the checked fields' relative order is persisted (existing `exportFields` setting; no schema change). Unchecked positions are session cosmetics restored to canonical order.
- `Defaults` resets the default set and canonical order; `Full` selects all fields but keeps the current order.

## Test Coverage

`tests/09-export-field-order.test.js` updated: drag listeners must be absent (regression guard), badges number checked fields in export order, renumber after reorder/select, and compact after unchecking. Total: 10 test files.

## Permissions

Unchanged. Still only `clipboardWrite`.

## Compatibility

Chrome 88+ (Manifest V3). Drop-in upgrade from 0.6.0.
