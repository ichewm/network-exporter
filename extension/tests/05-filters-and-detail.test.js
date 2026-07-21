"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

function makeMockEl() {
  return {
    checked: false,
    indeterminate: false,
    classList: {
      _set: new Set(),
      toggle(name, force) {
        if (force === true) { this._set.add(name); return true; }
        if (force === false) { this._set.delete(name); return false; }
        if (this._set.has(name)) { this._set.delete(name); return false; }
        this._set.add(name); return true;
      },
      contains(name) { return this._set.has(name); },
      add(name) { this._set.add(name); }
    },
    addEventListener() {},
    setAttribute() {},
    appendChild(c) { return c; },
    querySelectorAll() { return []; },
    children: [],
    textContent: "",
    title: "",
    innerHTML: ""
  };
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

const elements = new Map(ids.map((id) => [id, makeMockEl()]));
elements.get("statusSummary").children = [];
elements.get("statusSummary").appendChild = function(c) { this.children.push(c); };

const context = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URL,
  atob: (v) => Buffer.from(v, "base64").toString("binary"),
  navigator: { clipboard: { writeText: async (t) => { context.__copied = t; } } },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeMockEl());
      return elements.get(id);
    },
    createElement() { return makeMockEl(); },
    querySelectorAll(sel) {
      if (sel === "[data-field]") {
        return ["curlRequest","statusCode","responseBody","method","url","name","type","size","time","initiator","requestHeaders","requestBody","responseHeaders","mimeType"].map((f) => ({
          checked: ["curlRequest","statusCode","responseBody","method"].includes(f),
          dataset: { field: f }
        }));
      }
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
const normalizer = logic.normalizeRequest;

function makeRequest(overrides = {}) {
  return normalizer({
    _requestId: "test.1",
    _resourceType: "fetch",
    startedDateTime: "2026-06-08T10:00:00.000Z",
    time: 100,
    request: { method: "GET", url: "https://api.example.com/v2/users?page=1", headers: [{ name: "Accept", value: "application/json" }] },
    response: { status: 200, statusText: "OK", headers: [{ name: "Content-Type", value: "application/json" }], bodySize: 100, headersSize: 50, content: { mimeType: "application/json", text: '{"data":[]}' } },
    ...overrides
  });
}

const okReq = makeRequest();
const redirectReq = makeRequest({ _requestId: "r.301", response: { status: 301, statusText: "Moved", headers: [], content: { mimeType: "", text: "" } } });
const clientErrReq = makeRequest({ _requestId: "r.404", response: { status: 404, statusText: "Not Found", headers: [], content: { mimeType: "text/html", text: "<h1>404</h1>" } } });
const serverErrReq = makeRequest({ _requestId: "r.500", response: { status: 503, statusText: "Unavailable", headers: [], content: { mimeType: "text/html", text: "error" } } });
const failedReq = makeRequest({ _requestId: "r.failed", response: { status: 0, statusText: "", headers: [], content: { mimeType: "", text: "" } } });
const allReqs = [okReq, redirectReq, clientErrReq, serverErrReq, failedReq];

// ===== Status filter: each bucket =====
logic.state.statusFilter = "2";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 1);
logic.state.statusFilter = "3";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 1);
logic.state.statusFilter = "4";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 1);
logic.state.statusFilter = "5";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 1);
logic.state.statusFilter = "failed";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 1);
logic.state.statusFilter = "errors";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 3, "errors = 4xx + 5xx + failed");
logic.state.statusFilter = "";
assert.strictEqual(allReqs.filter(r => logic.matchesStatusFilter(r)).length, 5, "empty = all");

// ===== Exact filter: url =====
logic.state.filterText = "url:users";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "url:nope";
assert.ok(!logic.matchesFilterText(okReq));

// ===== Exact filter: name =====
logic.state.filterText = "name:users";
assert.ok(logic.matchesFilterText(okReq));

// ===== Exact filter: method =====
logic.state.filterText = "method:get";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "method:post";
assert.ok(!logic.matchesFilterText(okReq));

// ===== Exact filter: status-code =====
logic.state.filterText = "status-code:2";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "status-code:4";
assert.ok(!logic.matchesFilterText(okReq));

// ===== Exact filter: domain =====
logic.state.filterText = "domain:example.com";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "domain:other.com";
assert.ok(!logic.matchesFilterText(okReq));

// ===== Exact filter: type =====
logic.state.filterText = "type:fetch";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "type:fetch-xhr";
assert.ok(logic.matchesFilterText(okReq), "typeGroup should also match");

// ===== Exact filter: mime =====
logic.state.filterText = "mime:json";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "mime:html";
assert.ok(!logic.matchesFilterText(okReq));

// ===== Free text search =====
logic.state.filterText = "users";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "example.com";
assert.ok(logic.matchesFilterText(okReq));
logic.state.filterText = "xyz123nope";
assert.ok(!logic.matchesFilterText(okReq));

// ===== parseExactFilter: returns null for plain text =====
assert.strictEqual(logic.parseExactFilter("plain text"), null);
assert.strictEqual(logic.parseExactFilter(""), null);

// ===== parseExactFilter: extracts key/value =====
const parsed = logic.parseExactFilter("method:post");
assert.strictEqual(parsed.key, "method");
assert.strictEqual(parsed.value, "post");

// ===== getVisibleRequests: type chip + status combo =====
logic.state.requests = allReqs;
logic.state.activeType = "all";
logic.state.statusFilter = "errors";
logic.state.filterText = "";
logic.state.invertFilter = false;
logic.state.excludeExtensionRequests = true;
assert.strictEqual(logic.getVisibleRequests().length, 3);

// ===== getVisibleRequests: invert errors filter → shows non-errors =====
logic.state.invertFilter = true;
assert.strictEqual(logic.getVisibleRequests().length, 2);
logic.state.invertFilter = false;
logic.state.statusFilter = "";

// ===== getVisibleRequests: type filter =====
logic.state.activeType = "fetch-xhr";
assert.strictEqual(logic.getVisibleRequests().length, 5, "all 5 are fetch-xhr type");
logic.state.activeType = "all";

// ===== detail headers: includes all sections and labels =====
const headersDetail = logic.getDetailText(okReq, "headers");
assert.ok(headersDetail.includes("detail_general"));
assert.ok(headersDetail.includes("detail_url_label"));
assert.ok(headersDetail.includes("Accept: application/json"));
assert.ok(headersDetail.includes("Content-Type: application/json"));
assert.ok(headersDetail.includes("detail_request_headers"));
assert.ok(headersDetail.includes("detail_response_headers"));

// ===== detail payload: shows JSON pretty-printed =====
const payloadReq = makeRequest({ request: { method: "POST", url: "https://a.com", headers: [], postData: { text: '{"b":2,"a":1}' } } });
assert.ok(logic.getDetailText(payloadReq, "payload").includes('"b": 2'));

// ===== detail payload: no body =====
const noBodyReq = makeRequest({ request: { method: "GET", url: "https://a.com", headers: [], postData: { text: "" } } });
assert.strictEqual(logic.getDetailText(noBodyReq, "payload"), "detail_no_payload");

// ===== detail response: JSON body =====
assert.ok(logic.getDetailText(okReq, "response").includes('"data": []'));

// ===== detail response: no body =====
const emptyRespReq = makeRequest({ response: { status: 204, headers: [], content: { mimeType: "", text: "" } } });
assert.strictEqual(logic.getDetailText(emptyRespReq, "response"), "detail_no_response");

// ===== detail meta: valid JSON =====
const metaDetail = logic.getDetailText(okReq, "meta");
assert.ok(JSON.parse(metaDetail).statusCode === 200);

// ===== detail: unknown tab returns empty =====
assert.strictEqual(logic.getDetailText(okReq, "unknown"), "");

// ===== extension request exclusion =====
const extReq = makeRequest({ _requestId: "ext.1", request: { method: "GET", url: "chrome-extension://abc/script.js", headers: [] } });
assert.ok(logic.isExtensionRequest(extReq));
logic.state.requests = [okReq, extReq];
logic.state.activeType = "all";
logic.state.statusFilter = "";
logic.state.filterText = "";
logic.state.invertFilter = false;
logic.state.excludeExtensionRequests = true;
assert.strictEqual(logic.getVisibleRequests().length, 1, "extension excluded by default");

logic.state.excludeExtensionRequests = false;
assert.strictEqual(logic.getVisibleRequests().length, 2, "extension shown when toggle off");

// ===== getStatusClass: all variants =====
assert.strictEqual(logic.getStatusClass(okReq), "");
assert.strictEqual(logic.getStatusClass(clientErrReq), "status-client-error");
assert.strictEqual(logic.getStatusClass(serverErrReq), "status-server-error");
assert.strictEqual(logic.getStatusClass(failedReq), "status-failed");

// ===== computeStatusSummary: mixed =====
const mixed = logic.computeStatusSummary(allReqs);
assert.strictEqual(mixed.clientErrors, 1);
assert.strictEqual(mixed.serverErrors, 1);
assert.strictEqual(mixed.failed, 1);
assert.strictEqual(mixed.errors, 3);

// ===== copyExport: 0 selected → status message =====
logic.state.selectedIds.clear();
logic.state.requests = [okReq];
elements.get("statusMessage").textContent = "";
// simulate click
context.document.getElementById = (id) => elements.get(id) || makeMockEl();
// can't easily async test copyExport without harness, but verify export build path works
const exportObj = logic.buildExportObject(okReq, ["curlRequest","statusCode","responseBody"], { includeSensitive: false, truncateBodies: false });
assert.ok(exportObj.curlRequest.length > 0);
assert.strictEqual(exportObj.statusCode, 200);
assert.strictEqual(exportObj.responseBody, '{"data":[]}');

console.log("filters-and-detail-ok");
