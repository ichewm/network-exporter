# Chrome Web Store Submission Checklist

## Before Upload

- [ ] Confirm extension is loaded locally from the repository `extension/` folder.
- [ ] Confirm DevTools shows the `Network Exporter` tab.
- [ ] Confirm request capture works on a local test page.
- [ ] Confirm requests are captured after opening DevTools before selecting the `Network Exporter` tab.
- [ ] Confirm `Preserve log` keeps captured requests across reloads or redirects.
- [ ] Confirm panel settings survive a DevTools/browser restart: preserve log, invert, exclude extensions, filter text, type chip, status filter, export fields, truncation toggle, collapsed export pane.
- [ ] Confirm `Include sensitive headers` and record/pause state reset on a fresh DevTools session (intentional).
- [ ] Confirm JSON/Markdown copy still works in a normal DevTools window.
- [ ] If available, confirm copy works with DevTools embedded in an IDE webview (e.g. VS Code browser preview) — this is what the 0.5.1 execCommand fallback addresses.
- [ ] Confirm export fields reorder via ← → buttons and the numbered badges show the export order; JSON keys and Markdown sections follow the checked fields' order.
- [ ] Confirm the checked-field order survives a DevTools restart and that `Defaults` resets the order while `Full` keeps it.
- [ ] Confirm JSON copy works.
- [ ] Confirm Markdown copy works.
- [ ] Confirm sensitive headers are excluded by default.
- [ ] Confirm `Full` preset selects all fields.
- [ ] Confirm narrow DevTools layout is usable.

## Developer Dashboard

- [ ] Register or open Chrome Web Store Developer Dashboard.
- [ ] Upload `network-exporter-0.6.1.zip`.
- [ ] Category: Developer Tools.
- [ ] Add 128x128 icon from `listing-assets/icon-128.png`.
- [ ] Add screenshot `listing-assets/screenshots/network-exporter-main-1280x800.png`.
- [ ] Add small promotional image `listing-assets/promotional/network-exporter-small-promo-440x280.png`.
- [ ] Add top promotional tile `listing-assets/promotional/network-exporter-top-tile-1400x560.png`.
- [ ] Paste store description from `docs/store-listing.md`.
- [ ] Publish or host `docs/privacy-policy.md` and enter that URL.
- [ ] Complete privacy practices using `docs/privacy-dashboard-notes.md`.
- [ ] Use permission explanation from `docs/permission-justification.md`.

## Recommended First Publish Mode

Use `Unlisted` first for a small test group. Move to public listing after real-world validation.
