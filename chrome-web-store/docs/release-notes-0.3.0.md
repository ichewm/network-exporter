# Release Notes 0.3.0

Network Exporter 0.3.0 makes exported payloads easier to reason about when feeding them to large language models.

Included:

- After copying selected requests, the status line now shows the copied payload size in bytes (for example `4.2 kB`) and an estimated token count (for example `~1,180 tokens`)
- Both JSON and Markdown copy now report the same size and token feedback
- The token count chip is color-coded by budget tier so you can see at a glance whether the export fits a small, medium, or large context window
- Estimates are computed locally with a lightweight tokenizer; no remote services are used
- Kept the extension permission set unchanged
