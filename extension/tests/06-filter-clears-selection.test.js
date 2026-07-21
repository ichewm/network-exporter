"use strict";

// Regression test for the "sticky selection across filters" nightmare.
//
// Scenario being pinned down:
//   1. In "All", user clicks select-all  -> every request is selected.
//   2. User switches to a type chip (e.g. Fetch/XHR).
//   3. Previously the selection survived the filter change, so the user could
//      never clear the now-hidden requests from the selection. Toggling
//      select-all in the narrower view only touched the visible rows.
//
// Expected behavior (Plan A): changing ANY filter clears the selection.
// This file exercises every filter input end-to-end by triggering the real
// event handler registered in bindEvents().

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

// ===== Mock DOM (keeps event listeners so handlers can be fired directly) =====
class MockClassList {
  constructor() {
    this.values = new Set();
  }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  contains(name) { return this.values.has(name); }
  add(name) { this.values.add(name); }
}

class MockElement {
  constructor() {
    this.dataset = {};
    this.classList = new MockClassList();
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.title = "";
    this._innerHTML = "";
    this.checked = false;
    this.indeterminate = false;
    this.value = "";
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = value; this.children = []; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll() { return []; }
  closest() { return null; }
}

const ids = [
  "content", "recordToggle", "clearRequests", "filterToggle", "filterPanel",
  "filterInput", "preserveLog", "invertFilter", "excludeExtensionRequests",
  "statusFilter", "typeChips", "requestRows", "requestCount", "statusSummary",
  "selectedCount", "selectAll", "detailTabs", "detailName", "detailUrl",
  "detailContent", "exportPane", "toggleExportPane", "selectDefaults",
  "selectFullFields", "includeSensitiveHeaders", "truncateLargeBodies",
  "copyJson", "copyMarkdown", "statusMessage"
];
const elements = new Map(ids.map((id) => [id, new MockElement()]));

const fieldInputs = [
  "curlRequest", "statusCode", "responseBody", "method", "url", "name", "type",
  "size", "time", "initiator", "requestHeaders", "requestBody", "responseHeaders", "mimeType"
].map((field) => ({
  checked: ["curlRequest", "statusCode", "responseBody", "method"].includes(field),
  dataset: { field }
}));

const context = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URL,
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  navigator: { clipboard: { writeText: async () => undefined } },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new MockElement());
      return elements.get(id);
    },
    createElement() { return new MockElement(); },
    querySelectorAll(selector) {
      if (selector === "[data-field]") return fieldInputs;
      return [];
    }
  }
};
context.globalThis = context;
context.chrome = {
  i18n: {
    getMessage(key, args) {
      if (Array.isArray(args) && args.length) return key + "(" + args.join(",") + ")";
      return key;
    }
  }
};

vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: "shared.js" });
vm.runInContext(panelSource, context, { filename: "panel.js" });

const logic = context.NetworkExporterInternals;

// ===== Fixtures: one request per type group so chip switches are meaningful =====
function makeReq(id, resourceType, url, mimeType) {
  return logic.normalizeRequest({
    _requestId: id,
    _resourceType: resourceType,
    startedDateTime: "2026-07-21T10:00:00.000Z",
    time: 50,
    request: { method: "GET", url, headers: [] },
    response: {
      status: 200,
      statusText: "OK",
      headers: [],
      bodySize: 10,
      headersSize: 0,
      content: { mimeType, text: "x" }
    }
  });
}

const fetchReq = makeReq("a.1", "fetch", "https://api.example.com/users", "application/json");
const docReq = makeReq("a.2", "document", "https://example.com/", "text/html");
const jsReq = makeReq("a.3", "script", "https://example.com/app.js", "application/javascript");

assert.strictEqual(fetchReq.typeGroup, "fetch-xhr");
assert.strictEqual(docReq.typeGroup, "doc");
assert.strictEqual(jsReq.typeGroup, "js");

const allReqs = [fetchReq, docReq, jsReq];

function loadRequests() {
  logic.state.requests = allReqs;
  logic.state.selectedIds.clear();
  logic.state.activeRequestId = "";
  logic.state.activeType = "all";
  logic.state.statusFilter = "";
  logic.state.filterText = "";
  logic.state.invertFilter = false;
  logic.state.excludeExtensionRequests = true;
}

function selectAllVisible() {
  for (const r of logic.getVisibleRequests()) {
    logic.state.selectedIds.add(r.id);
  }
}

// ===== 1. clearSelection() contract =====
loadRequests();
logic.state.selectedIds.add(fetchReq.id);
logic.state.selectedIds.add(docReq.id);
assert.strictEqual(logic.state.selectedIds.size, 2);
logic.clearSelection();
assert.strictEqual(logic.state.selectedIds.size, 0, "clearSelection() empties selectedIds");

// ===== 2. Type chip switch clears selection (the reported nightmare) =====
loadRequests();
selectAllVisible();
assert.strictEqual(logic.state.selectedIds.size, 3, "selectAll picked all 3");
const fakeFetchChip = { dataset: { type: "fetch-xhr" } };
elements.get("typeChips").listeners.click({ target: { closest: () => fakeFetchChip } });
assert.strictEqual(logic.state.activeType, "fetch-xhr", "chip switch applied");
assert.strictEqual(logic.getVisibleRequests().length, 1, "only fetchReq visible under fetch-xhr");
assert.strictEqual(logic.state.selectedIds.size, 0, "switching type chip clears selection");

// ===== 3. Search box input clears selection =====
loadRequests();
selectAllVisible();
elements.get("filterInput").value = "users";
elements.get("filterInput").listeners.input();
assert.strictEqual(logic.state.filterText, "users");
assert.strictEqual(logic.state.selectedIds.size, 0, "typing in search box clears selection");

// ===== 4. Status filter change clears selection =====
loadRequests();
selectAllVisible();
elements.get("statusFilter").value = "2";
elements.get("statusFilter").listeners.change();
assert.strictEqual(logic.state.statusFilter, "2");
assert.strictEqual(logic.state.selectedIds.size, 0, "changing status filter clears selection");

// ===== 5. Invert toggle clears selection =====
loadRequests();
selectAllVisible();
elements.get("invertFilter").checked = true;
elements.get("invertFilter").listeners.change();
assert.strictEqual(logic.state.invertFilter, true);
assert.strictEqual(logic.state.selectedIds.size, 0, "toggling invert clears selection");

// ===== 6. Exclude-extensions toggle clears selection =====
loadRequests();
selectAllVisible();
elements.get("excludeExtensionRequests").checked = false;
elements.get("excludeExtensionRequests").listeners.change();
assert.strictEqual(logic.state.excludeExtensionRequests, false);
assert.strictEqual(logic.state.selectedIds.size, 0, "toggling exclude-extensions clears selection");

// ===== 7. Regression: select-all itself is a selection action, it must NOT clear =====
loadRequests();
elements.get("selectAll").checked = true;
elements.get("selectAll").listeners.change();
assert.strictEqual(logic.state.selectedIds.size, 3, "select-all fills the selection instead of clearing it");

// ===== 8. Regression: clearing capture also clears selection (unchanged behavior) =====
loadRequests();
selectAllVisible();
const captureStore = {
  clear() { logic.state.requests = []; },
  setRecording() {},
  setPreserveLog() {},
  subscribe() { return () => undefined; }
};
logic.attachNetworkExporterStore(captureStore);
logic.applyCaptureSnapshot({ requests: [], isRecording: true, preserveLog: false });
// Clear button on the toolbar clears requests; selection for gone ids is pruned by applyCaptureSnapshot
assert.strictEqual(logic.state.selectedIds.size, 0, "clearing requests drops stale selections");

console.log("filter-clears-selection-ok");
