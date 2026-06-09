# Chrome Web Store Release Package

## Upload ZIP

Upload this file in the Chrome Web Store Developer Dashboard:

```text
network-exporter-0.1.0.zip
```

The ZIP has `manifest.json` at the archive root and contains only runtime extension files.

## Listing Assets

Use these files in the Store Listing tab:

```text
listing-assets/icon-128.png
listing-assets/screenshots/network-exporter-main-1280x800.png
listing-assets/promotional/network-exporter-small-promo-440x280.png
listing-assets/promotional/network-exporter-top-tile-1400x560.png
```

## Listing Text And Policy Drafts

Use these files when filling the Developer Dashboard:

```text
docs/store-listing.md
docs/privacy-policy.md
docs/privacy-dashboard-notes.md
docs/permission-justification.md
docs/release-notes-0.1.0.md
docs/submission-checklist.md
```

The privacy policy must be hosted at a public URL before final submission.

## Validation Performed

```text
release-manifest-ok
chrome-pack-ok
dev-manifest-ok
panel-logic-ok
```

Image sizes:

```text
icon-128.png: 128 x 128
network-exporter-main-1280x800.png: 1280 x 800
network-exporter-small-promo-440x280.png: 440 x 280
network-exporter-top-tile-1400x560.png: 1400 x 560, RGB PNG without alpha
```
