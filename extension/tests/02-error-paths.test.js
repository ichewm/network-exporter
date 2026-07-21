"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const devtoolsSource = fs.readFileSync(path.join(root, "devtools.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

// ===== panel/shared error + edge tests (panel.js) =====
const panelContext = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URL,
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
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
panelContext.globalThis = panelContext;
panelContext.chrome = {
  i18n: {
    getMessage(key, args) {
      if (args && args.length) {
        return key + ":" + String(args[0]);
      }
      return key;
    }
  }
};
vm.createContext(panelContext);
vm.runInContext(sharedSource, panelContext, { filename: "shared.js" });
vm.runInContext(panelSource, panelContext, { filename: "panel.js" });

const shared = panelContext.NetworkExporterShared;
const logic = panelContext.NetworkExporterInternals;

// --- formatBytes boundaries ---
assert.strictEqual(logic.formatBytes(0), "0 B");
assert.strictEqual(logic.formatBytes(1023), "1023 B");
assert.strictEqual(logic.formatBytes(1024), "1.0 kB");
assert.strictEqual(logic.formatBytes(1048576), "1.0 MB");
assert.strictEqual(logic.formatBytes(-5), "-");
assert.strictEqual(logic.formatBytes(undefined), "-");
assert.strictEqual(logic.formatBytes(NaN), "-");

// --- formatMs boundaries ---
assert.strictEqual(logic.formatMs(0), "0 ms");
assert.strictEqual(logic.formatMs(1.4), "1 ms");
assert.strictEqual(logic.formatMs(1.6), "2 ms");
assert.strictEqual(logic.formatMs(undefined), "-");
assert.strictEqual(logic.formatMs(NaN), "-");

// --- getByteLength: multibyte ---
assert.strictEqual(shared.getByteLength("\u4e2d\u6587"), 6, "two CJK chars x 3 bytes = 6");

// --- estimateTokens: empty + monotonic ---
assert.strictEqual(shared.estimateTokens(""), 0);
assert.ok(shared.estimateTokens("a") === 1);
assert.ok(shared.estimateTokens("a".repeat(10)) >= 3);

// --- headersToObject: duplicate header names collapse into array ---
const dupHeaders = logic.headersToObject([
  { name: "Set-Cookie", value: "a=1" },
  { name: "Set-Cookie", value: "b=2" },
  { name: "X-One", value: "1" }
]);
assert.strictEqual(JSON.stringify(dupHeaders["Set-Cookie"]), JSON.stringify(["a=1", "b=2"]));
assert.strictEqual(dupHeaders["X-One"], "1");

// --- headersToObject: empty name skipped ---
assert.strictEqual(JSON.stringify(logic.headersToObject([{ name: "", value: "x" }])), "{}");

// --- filterHeaders: case-insensitive sensitive match ---
const filtered = logic.filterHeaders(
  [
    { name: "AUTHORIZATION", value: "Bearer x" },
    { name: "Cookie", value: "y" },
    { name: "X-Safe", value: "ok" }
  ],
  false
);
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].name, "X-Safe");

// --- getDomain: invalid url returns empty string ---
assert.strictEqual(logic.getDomain("not a url"), "");
assert.strictEqual(logic.getDomain("https://a.b.c/path"), "a.b.c");

// --- getCodeFence: grows past longest run ---
assert.strictEqual(logic.getCodeFence("no fences"), "```");
assert.strictEqual(logic.getCodeFence("has ``` triple"), "````");
assert.strictEqual(logic.getCodeFence("has ```` quad"), "`````");

// ===== devtools.js error paths =====
function makeDevtoolsVm() {
  const listeners = { finished: [], navigated: [] };
  const ctx = {
    console,
    TextDecoder,
    TextEncoder,
    URL,
    chrome: {
      devtools: {
        network: {
          getHAR(cb) { cb({ entries: [] }); },
          onRequestFinished: { addListener(fn) { listeners.finished.push(fn); } },
          onNavigated: { addListener(fn) { listeners.navigated.push(fn); } }
        },
        panels: {
          create(name, icon, page, cb) {
            cb({ onShown: { addListener() {} } });
          }
        }
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(sharedSource, ctx, { filename: "shared.js" });
  vm.runInContext(devtoolsSource, ctx, { filename: "devtools.js" });
  return { ctx, store: ctx.NetworkExporterCaptureStore, listeners };
}

// --- a throwing/missing-field entry must not crash onRequestFinished ---
const { store, listeners } = makeDevtoolsVm();
const poison = new Proxy({}, {
  get(target, prop) {
    if (prop === "request") throw new Error("poisoned");
    return undefined;
  }
});
assert.doesNotThrow(() => listeners.finished[0](poison));
const snap = store.getSnapshot();
assert.ok(snap.requests.length >= 1);
assert.ok(snap.requests[0].id.startsWith("error:"), "poisoned entry should become an error placeholder");
assert.ok(snap.requests[0].responseBody.includes("failed to capture"));

// --- getContent throwing does not crash the callback ---
const { store: store2, listeners: listeners2 } = makeDevtoolsVm();
const throwingContentEntry = {
  _requestId: "ok.1",
  request: { method: "GET", url: "https://x.io/a", headers: [] },
  response: { status: 200, headers: [], content: { mimeType: "text/plain", text: "" } }
};
listeners2.finished[0](throwingContentEntry);
throwingContentEntry.getContent = () => { throw new Error("content boom"); };
assert.doesNotThrow(() => listeners2.finished[0](throwingContentEntry));

// --- malformed HAR entries do not crash hydration ---
const listeners3 = { finished: [], navigated: [] };
const ctx3 = {
  console,
  TextDecoder,
  TextEncoder,
  URL,
  chrome: {
    devtools: {
      network: {
        getHAR(cb) {
          cb({ entries: [null, undefined, { request: null }, { request: { url: "https://ok.io" } }] });
        },
        onRequestFinished: { addListener(fn) { listeners3.finished.push(fn); } },
        onNavigated: { addListener(fn) { listeners3.navigated.push(fn); } }
      },
      panels: { create(n, i, p, cb) { cb({ onShown: { addListener() {} } }); } }
    }
  }
};
ctx3.globalThis = ctx3;
vm.createContext(ctx3);
vm.runInContext(sharedSource, ctx3, { filename: "shared.js" });
vm.runInContext(devtoolsSource, ctx3, { filename: "devtools.js" });
const store3 = ctx3.NetworkExporterCaptureStore;
const snap3 = store3.getSnapshot();
assert.ok(snap3.requests.length >= 1, "hydration should survive malformed entries");

console.log("error-paths-ok");
