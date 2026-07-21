"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

const context = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URL,
  atob: (value) => {
    // Browser-like strict base64: throw on non-alphabet characters.
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
      throw new DOMException("InvalidCharacterError", "InvalidCharacterError");
    }
    return Buffer.from(value, "base64").toString("binary");
  },
  navigator: { clipboard: { writeText: async () => undefined } },
  document: {
    getElementById() {
      return {
        checked: false,
        classList: { toggle() {}, contains() { return false; } },
        addEventListener() {},
        setAttribute() {},
        appendChild() {},
        querySelectorAll() { return []; },
        children: [],
        textContent: "",
        innerHTML: ""
      };
    },
    createElement() {
      return { classList: { add() {}, toggle() {}, contains() { return false; } }, appendChild() {}, setAttribute() {}, querySelectorAll() { return []; }, children: [] };
    },
    querySelectorAll() { return []; }
  }
};
context.globalThis = context;
context.chrome = {
  i18n: {
    getMessage(key, args) {
      if (args && args.length) {
        return key + ":" + String(args[0]);
      }
      return key;
    }
  }
};
vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: "shared.js" });
vm.runInContext(panelSource, context, { filename: "panel.js" });

const shared = context.NetworkExporterShared;
const logic = context.NetworkExporterInternals;

// --- truncateBody: under limit passes through ---
assert.strictEqual(shared.truncateBody("short", 100), "short");

// --- truncateBody: over limit gets marker + original byte count ---
const big = "x".repeat(1000);
const truncated = shared.truncateBody(big, 100);
assert.ok(truncated.includes("[truncated, original"));
assert.ok(truncated.includes("1,000 bytes"));
assert.ok(truncated.length < big.length);

// --- truncateBody: default limit is MAX_EXPORT_BODY_BYTES ---
assert.ok(shared.truncateBody("a".repeat(shared.MAX_EXPORT_BODY_BYTES)).length <= shared.MAX_EXPORT_BODY_BYTES + 80);

// --- truncateBody: multibyte does not crash mid-codepoint ---
const cjk = "中".repeat(10000);
const cjkCut = shared.truncateBody(cjk, 10);
assert.ok(typeof cjkCut === "string");

// --- isLikelyBinaryMimeType ---
assert.strictEqual(shared.isLikelyBinaryMimeType("image/png"), true);
assert.strictEqual(shared.isLikelyBinaryMimeType("font/woff2"), true);
assert.strictEqual(shared.isLikelyBinaryMimeType("application/octet-stream"), true);
assert.strictEqual(shared.isLikelyBinaryMimeType("application/json"), false);
assert.strictEqual(shared.isLikelyBinaryMimeType("text/html"), false);
assert.strictEqual(shared.isLikelyBinaryMimeType(""), false);
assert.strictEqual(shared.isLikelyBinaryMimeType(undefined), false);

// --- maybeDecodeResponseBody: binary mime returns placeholder, never decodes ---
const binaryReq = {
  responseBody: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  responseEncoding: "base64",
  mimeType: "image/png"
};
const binaryOut = logic.maybeDecodeResponseBody(binaryReq);
assert.ok(binaryOut.startsWith("[binary response: image/png"));
assert.ok(binaryOut.includes("bytes]"));

// --- maybeDecodeResponseBody: invalid base64 returns safe placeholder, not raw garbage ---
const badBase64 = { responseBody: "!!!not-base64!!!", responseEncoding: "base64", mimeType: "text/plain" };
const badOut = logic.maybeDecodeResponseBody(badBase64);
assert.strictEqual(badOut, "[response body could not be decoded]");

// --- maybeDecodeResponseBody: valid base64 text still decodes ---
const encoded = Buffer.from("hello world", "utf8").toString("base64");
assert.strictEqual(
  logic.maybeDecodeResponseBody({ responseBody: encoded, responseEncoding: "base64", mimeType: "text/plain" }),
  "hello world"
);

// --- buildExportObject: truncates responseBody when truncateBodies true ---
const hugeBody = "B".repeat(shared.MAX_EXPORT_BODY_BYTES + 1000);
const hugeReq = {
  responseBody: hugeBody,
  responseEncoding: "",
  mimeType: "text/plain",
  requestHeaders: [],
  responseHeaders: []
};
const truncatedExport = logic.buildExportObject(hugeReq, ["responseBody"], { truncateBodies: true });
assert.ok(truncatedExport.responseBody.length < hugeBody.length);
assert.ok(truncatedExport.responseBody.includes("[truncated"));

// --- buildExportObject: no truncation when truncateBodies false ---
const fullExport = logic.buildExportObject(hugeReq, ["responseBody"], { truncateBodies: false });
assert.strictEqual(fullExport.responseBody, hugeBody);

// --- buildCurl: truncates long request body when truncateBodies true ---
const longBodyReq = { url: "https://x.io", method: "POST", requestHeaders: [], requestBody: "Q".repeat(shared.MAX_EXPORT_BODY_BYTES + 1000) };
const curlTrunc = logic.buildCurl(longBodyReq, false, true);
const curlFull = logic.buildCurl(longBodyReq, false, false);
assert.ok(curlTrunc.includes("[truncated"));
assert.ok(curlTrunc.length < curlFull.length, "truncated curl must be shorter than full curl");

// --- shellQuote via buildCurl: single quote in body is escaped ---
const quoteReq = { url: "https://x.io", method: "POST", requestHeaders: [], requestBody: "it's a test" };
const curlQuote = logic.buildCurl(quoteReq, false, false);
assert.ok(curlQuote.includes("it'\\''s a test"));

// --- shellQuote: newline in body is preserved inside quotes (single-quote safe) ---
const newlineReq = { url: "https://x.io", method: "POST", requestHeaders: [], requestBody: "line1\nline2" };
const curlNewline = logic.buildCurl(newlineReq, false, false);
assert.ok(curlNewline.includes("line1\nline2"));

// --- clampStoredBody: under MAX_STORED_BODY_BYTES passes through ---
assert.strictEqual(shared.clampStoredBody("small"), "small");

// --- clampStoredBody: huge input is clamped, not returned whole ---
const hugeStored = "Z".repeat(shared.MAX_STORED_BODY_BYTES * 2);
const clamped = shared.clampStoredBody(hugeStored);
assert.ok(clamped.length < hugeStored.length);
assert.ok(clamped.includes("[truncated"));

// --- Markdown escapes backticks (existing) and handles HTML-significant chars safely ---
const md = logic.toMarkdown([{ responseBody: "<script>alert(1)</script>" }], ["responseBody"]);
assert.ok(md.includes("<script>alert(1)</script>")); // raw in code fence, which is fine for markdown

console.log("body-robustness-ok");
