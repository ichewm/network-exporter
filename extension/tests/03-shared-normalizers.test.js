"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");

const context = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URL,
  Math,
  Date
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: "shared.js" });

const shared = context.NetworkExporterShared;
const normalizer = shared.createRequestNormalizer();

function makeEntry(overrides = {}) {
  return {
    _requestId: "base.1",
    _resourceType: "fetch",
    startedDateTime: "2026-06-08T10:00:00.000Z",
    time: 100,
    request: {
      method: "GET",
      url: "https://example.com/path/page",
      headers: [{ name: "Host", value: "example.com" }],
      postData: { text: "" }
    },
    response: {
      status: 200,
      statusText: "OK",
      headers: [],
      bodySize: 42,
      headersSize: 20,
      content: { mimeType: "application/json", size: 42, text: "{}" }
    },
    timings: { send: 1, wait: 90, receive: 9 },
    ...overrides
  };
}

// ===== getName =====
assert.strictEqual(shared.getName("https://a.com/api/users?page=1"), "users?page=1");
assert.strictEqual(shared.getName("https://a.com/"), "a.com");
assert.strictEqual(shared.getName("https://a.com"), "a.com");
assert.strictEqual(shared.getName("https://a.com/path/to/file.js"), "file.js");
assert.strictEqual(shared.getName(""), "(unknown)");
assert.strictEqual(shared.getName("not-a-url"), "not-a-url");

// ===== getTypeGroup — all resource types =====
assert.strictEqual(shared.getTypeGroup("xhr", ""), "fetch-xhr");
assert.strictEqual(shared.getTypeGroup("fetch", ""), "fetch-xhr");
assert.strictEqual(shared.getTypeGroup("document", ""), "doc");
assert.strictEqual(shared.getTypeGroup("stylesheet", ""), "css");
assert.strictEqual(shared.getTypeGroup("script", ""), "js");
assert.strictEqual(shared.getTypeGroup("font", ""), "font");
assert.strictEqual(shared.getTypeGroup("image", ""), "img");
assert.strictEqual(shared.getTypeGroup("media", ""), "media");
assert.strictEqual(shared.getTypeGroup("manifest", ""), "manifest");
assert.strictEqual(shared.getTypeGroup("websocket", ""), "socket");
assert.strictEqual(shared.getTypeGroup("wasm", ""), "wasm");
assert.strictEqual(shared.getTypeGroup("ping", ""), "other");
assert.strictEqual(shared.getTypeGroup("", "text/html"), "doc");
assert.strictEqual(shared.getTypeGroup("", "text/css"), "css");
assert.strictEqual(shared.getTypeGroup("", "application/javascript"), "js");
assert.strictEqual(shared.getTypeGroup("", "image/png"), "img");
assert.strictEqual(shared.getTypeGroup("", "font/woff2"), "font");
assert.strictEqual(shared.getTypeGroup("", "application/json"), "fetch-xhr");
assert.strictEqual(shared.getTypeGroup("", "audio/mpeg"), "media");
assert.strictEqual(shared.getTypeGroup("", "application/wasm"), "wasm");
assert.strictEqual(shared.getTypeGroup("", "application/manifest+json"), "manifest");
assert.strictEqual(shared.getTypeGroup("", "unknown/random"), "other");

// ===== getSizeBytes =====
assert.strictEqual(normalizer.normalizeRequest(makeEntry()).sizeBytes, 62);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ response: { bodySize: -1, headersSize: 30, content: { size: 100 } } })).sizeBytes,
  100
);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ response: { bodySize: -1, headersSize: -1, content: { size: -1 } } })).sizeBytes,
  null
);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ response: { bodySize: 0, headersSize: 0, content: { size: 0 } } })).sizeBytes,
  0
);

// ===== getInitiator (via normalizer) =====
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ _initiator: "script.js" })).initiator,
  "script.js"
);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ _initiator: { url: "https://a.com/app.js", lineNumber: 42 } })).initiator,
  "app.js:42"
);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ _initiator: { type: "parser" } })).initiator,
  "parser"
);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ _initiator: { stack: { callFrames: [{ url: "https://b.com/lib.js", lineNumber: 10 }] } } })).initiator,
  "lib.js:10"
);
assert.strictEqual(
  normalizer.normalizeRequest(makeEntry({ _initiator: null })).initiator,
  ""
);

// ===== resource type guessing from MIME (no _resourceType) =====
const htmlReq = normalizer.normalizeRequest(makeEntry({
  _resourceType: undefined,
  _requestId: "html.1",
  response: { status: 200, headers: [], content: { mimeType: "text/html", text: "<html>" } }
}));
assert.strictEqual(htmlReq.type, "document");
assert.strictEqual(htmlReq.typeGroup, "doc");

const pngReq = normalizer.normalizeRequest(makeEntry({
  _resourceType: undefined,
  _requestId: "png.1",
  response: { status: 200, headers: [], content: { mimeType: "image/png", text: "" } }
}));
assert.strictEqual(pngReq.type, "image");
assert.strictEqual(pngReq.typeGroup, "img");

// ===== fallback ID generation (no _requestId) =====
const fallbackReq = normalizer.normalizeRequest(makeEntry({ _requestId: undefined }));
assert.ok(fallbackReq.id.startsWith("fallback:"), "fallback id should start with fallback:");

// ===== timings sum fallback =====
const timedReq = normalizer.normalizeRequest(makeEntry({ time: undefined, timings: { send: 5, wait: 10, receive: 5, blocked: -1 } }));
assert.strictEqual(timedReq.timeMs, 20);

const noTimingReq = normalizer.normalizeRequest(makeEntry({ time: undefined, timings: {} }));
assert.strictEqual(noTimingReq.timeMs, null);

// ===== normalizeHeaders — empty values =====
const emptyHeadersReq = normalizer.normalizeRequest(makeEntry({
  request: { method: "GET", url: "https://a.com", headers: [{ name: "", value: "x" }, { name: "X-OK", value: "" }] }
}));
assert.strictEqual(emptyHeadersReq.requestHeaders.length, 2);
assert.strictEqual(emptyHeadersReq.requestHeaders[0].name, "");
assert.strictEqual(emptyHeadersReq.requestHeaders[0].value, "x");

console.log("shared-normalizers-ok");
