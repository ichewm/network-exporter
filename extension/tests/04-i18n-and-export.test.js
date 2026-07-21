"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

// ===== panel context with i18n + full DOM stub =====
function makeMockEl() {
  return {
    checked: false,
    indeterminate: false,
    classList: { toggle() {}, contains() { return false; }, add() {} },
    addEventListener() {},
    setAttribute() {},
    appendChild(c) { this.children = this.children || []; this.children.push(c); return c; },
    querySelectorAll() { return []; },
    children: [],
    textContent: "",
    title: "",
    placeholder: "",
    innerHTML: "",
    dataset: {}
  };
}

const elements = {};
function getEl(id) {
  if (!elements[id]) elements[id] = makeMockEl();
  return elements[id];
}

const context = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URL,
  atob: (v) => Buffer.from(v, "base64").toString("binary"),
  navigator: { clipboard: { writeText: async (text) => { context.__lastCopied = text; } } },
  document: {
    getElementById: getEl,
    createElement: () => makeMockEl(),
    querySelectorAll(sel) {
      if (sel === "[data-field]") {
        return [
          { checked: true, dataset: { field: "curlRequest" } },
          { checked: true, dataset: { field: "statusCode" } },
          { checked: true, dataset: { field: "responseBody" } },
          { checked: true, dataset: { field: "method" } },
          { checked: true, dataset: { field: "url" } },
          { checked: true, dataset: { field: "name" } },
          { checked: true, dataset: { field: "type" } },
          { checked: true, dataset: { field: "size" } },
          { checked: true, dataset: { field: "time" } },
          { checked: true, dataset: { field: "initiator" } },
          { checked: true, dataset: { field: "requestHeaders" } },
          { checked: true, dataset: { field: "requestBody" } },
          { checked: true, dataset: { field: "responseHeaders" } },
          { checked: true, dataset: { field: "mimeType" } }
        ];
      }
      // for applyI18n
      return [];
    },
    // applyI18n uses document.querySelectorAll
    _i18nElements: []
  }
};
context.globalThis = context;

// i18n mock: returns key with arg suffix
context.chrome = {
  i18n: {
    getMessage(key, args) {
      if (Array.isArray(args) && args.length) {
        return key + "(" + args.join(",") + ")";
      }
      return key;
    }
  }
};

vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: "shared.js" });
vm.runInContext(panelSource, context, { filename: "panel.js" });

const logic = context.NetworkExporterInternals;
const shared = context.NetworkExporterShared;

// ===== t() basic =====
assert.strictEqual(logic ? "exposed" : "missing", "exposed");

// ===== buildExportObject — every field type =====
const baseReq = {
  id: "test.1",
  name: "page",
  url: "https://example.com/api/page?id=1",
  method: "POST",
  statusCode: 201,
  statusText: "Created",
  type: "fetch",
  typeGroup: "fetch-xhr",
  mimeType: "application/json",
  sizeBytes: 1024,
  timeMs: 250,
  initiator: "app.js:5",
  startedDateTime: "2026-06-08T10:00:00.000Z",
  requestHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Authorization", value: "Bearer secret" }],
  responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Set-Cookie", value: "sid=secret" }],
  requestBody: '{"query":"test"}',
  responseBody: '{"ok":true}',
  responseEncoding: ""
};

const allFields = ["curlRequest", "statusCode", "responseBody", "method", "url", "name", "type", "size", "time", "initiator", "requestHeaders", "requestBody", "responseHeaders", "mimeType"];

const fullExport = logic.buildExportObject(baseReq, allFields, { includeSensitive: true, truncateBodies: false });

// each field is present
assert.strictEqual(fullExport.statusCode, 201);
assert.strictEqual(fullExport.method, "POST");
assert.strictEqual(fullExport.url, "https://example.com/api/page?id=1");
assert.strictEqual(fullExport.name, "page");
assert.strictEqual(fullExport.type, "fetch");
assert.ok(fullExport.size.includes("kB"));
assert.strictEqual(fullExport.sizeBytes, 1024);
assert.ok(fullExport.time.includes("ms"));
assert.strictEqual(fullExport.timeMs, 250);
assert.strictEqual(fullExport.initiator, "app.js:5");
assert.strictEqual(fullExport.responseBody, '{"ok":true}');
assert.strictEqual(fullExport.requestBody, '{"query":"test"}');
assert.strictEqual(fullExport.mimeType, "application/json");
assert.ok(fullExport.curlRequest.includes("curl 'https://example.com/api/page?id=1'"));
assert.ok(fullExport.curlRequest.includes("-X 'POST'"));
assert.ok(fullExport.curlRequest.includes("Authorization"));
assert.ok(fullExport.curlRequest.includes("--data-raw"));
assert.ok("Content-Type" in fullExport.requestHeaders);
assert.ok("Authorization" in fullExport.requestHeaders);
assert.ok("Content-Type" in fullExport.responseHeaders);

// ===== buildExportObject — sensitive headers filtered by default =====
const safeExport = logic.buildExportObject(baseReq, ["curlRequest", "requestHeaders", "responseHeaders"], { includeSensitive: false, truncateBodies: false });
assert.ok(!safeExport.curlRequest.includes("Authorization"));
assert.ok(!safeExport.curlRequest.includes("Set-Cookie"));
assert.ok(!("Authorization" in safeExport.requestHeaders));
assert.ok(!("Set-Cookie" in safeExport.responseHeaders));

// ===== buildCurl — GET method has no -X =====
const getCurl = logic.buildCurl({ url: "https://a.com", method: "GET", requestHeaders: [], requestBody: "" }, false, false);
assert.ok(!getCurl.includes("-X"));

// ===== buildCurl — no body flag when empty =====
assert.ok(!getCurl.includes("--data-raw"));

// ===== buildCurl — POST with body =====
const postCurl = logic.buildCurl({ url: "https://a.com", method: "POST", requestHeaders: [], requestBody: "data" }, false, false);
assert.ok(postCurl.includes("-X 'POST'"));
assert.ok(postCurl.includes("--data-raw 'data'"));

// ===== toMarkdown — full structure with all field types =====
const mdReq = {
  statusCode: 200,
  method: "GET",
  responseBody: '{"a":1}',
  requestHeaders: { "Content-Type": "application/json" },
  size: "1.0 kB",
  sizeBytes: 1024,
  name: "test"
};
const md = logic.toMarkdown([mdReq], ["statusCode", "method", "responseBody", "requestHeaders", "size", "name"]);
assert.ok(md.includes("## Request 1"));
assert.ok(md.includes("### statusCode"));
assert.ok(md.includes("200"));
assert.ok(md.includes("### responseBody"));
assert.ok(md.includes('{"a":1}'), "responseBody string value preserved");
assert.ok(md.includes("### requestHeaders"));
assert.ok(md.includes("```json"), "object field gets json fence");
assert.ok(md.includes("### requestHeaders"));
assert.ok(md.includes("### size"));
assert.ok(md.includes("### name"));
assert.ok(md.includes("test"));

// ===== toMarkdown — code fence grows for nested backticks =====
const mdWithFence = logic.toMarkdown([{ responseBody: "```nested```" }], ["responseBody"]);
assert.ok(mdWithFence.includes("````"));
assert.ok(!mdWithFence.match(/````\n````\n/), "fence should not be empty");

// ===== toMarkdown — multiple requests numbered =====
const mdMulti = logic.toMarkdown([{ statusCode: 1 }, { statusCode: 2 }], ["statusCode"]);
assert.ok(mdMulti.includes("## Request 1"));
assert.ok(mdMulti.includes("## Request 2"));

// ===== formatMaybeJson =====
assert.strictEqual(logic.formatMaybeJson('{"b":1,"a":2}'), '{\n  "b": 1,\n  "a": 2\n}');
assert.strictEqual(logic.formatMaybeJson("plain text"), "plain text");
assert.strictEqual(logic.formatMaybeJson(""), "");

// ===== formatMetaDetail — JSON output =====
const metaReq = { ...baseReq, sizeBytes: 100, timeMs: 50 };
const meta = logic.formatMetaDetail(metaReq);
const parsed = JSON.parse(meta);
assert.strictEqual(parsed.statusCode, 201);
assert.strictEqual(parsed.sizeBytes, 100);
assert.strictEqual(parsed.timeMs, 50);

// ===== estimateTokens — regression =====
assert.strictEqual(shared.estimateTokens(""), 0);
assert.strictEqual(shared.estimateTokens("hi"), 1);
assert.ok(shared.estimateTokens("hello world this is a test") > 3);

// ===== getByteLength — unicode =====
assert.strictEqual(shared.getByteLength("abc"), 3);
assert.strictEqual(shared.getByteLength("\u4e2d"), 3);
assert.strictEqual(shared.getByteLength(""), 0);

console.log("i18n-and-export-ok");
