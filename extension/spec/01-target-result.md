# Target Result

## Target User Flow

1. User installs the unpacked Chrome extension locally.
2. User opens DevTools on a target page.
3. User opens the `Network Exporter` DevTools tab.
4. User reloads the page or performs the workflow that triggers API requests.
5. The panel shows captured requests in a table.
6. User filters requests by URL text, status, type chip, or query syntax.
7. User clicks a single request row to inspect headers, payload, response, or metadata.
8. User selects several requests with checkboxes.
9. User selects which fields to export.
10. User clicks `Copy selected as JSON` or `Copy selected as Markdown`.
11. Clipboard contains only the selected requests and selected fields.

## Expected Panel Layout

Top toolbar:

- Record toggle
- Clear button
- Filter panel toggle
- Search input
- Invert checkbox
- Exclude extensions checkbox
- Status group select

Filter row:

- Type chips matching common Chrome Network panel resource categories.

Main content:

- Left side request table and selected-request detail view.
- Right side export options.

Request table columns:

- Select checkbox
- Name
- Method
- Status
- Type
- Size
- Time
- Initiator
- URL

Export options:

- Field checkboxes
- `Defaults` field preset
- `Full` field preset
- Sensitive header opt-in checkbox
- `Copy selected as JSON`
- `Copy selected as Markdown`
- Status message area

Request detail tabs:

- Headers
- Payload
- Response
- Meta

## Expected JSON Output

Example:

```json
[
  {
    "curlRequest": "curl 'https://example.com/api/token' -X 'POST' -H 'content-type: application/json' --data-raw '{\"grant\":\"demo\"}'",
    "statusCode": 200,
    "responseBody": "{\"ok\":true}",
    "url": "https://example.com/api/token",
    "method": "POST"
  }
]
```

## Expected Markdown Output

Example:

```markdown
## Request 1
### curlRequest
```
curl 'https://example.com/api/token' -X 'POST'
```
### statusCode
200
### responseBody
```
{"ok":true}
```
```

## Data Handling Target

- Request data stays local in the DevTools extension panel.
- Clipboard export happens only after the user selects requests and clicks copy.
- Sensitive request and response headers are omitted unless the user chooses to include them.

## Current Version Target

Version `0.1.0` should be a usable local MVP, not a Chrome Web Store release.

It should prove the workflow:

- DevTools panel appears.
- Network requests can be captured.
- Requests can be filtered and selected.
- Export fields can be configured.
- Selected records can be copied as focused JSON or Markdown.
