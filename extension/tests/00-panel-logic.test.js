"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const devtoolsSource = fs.readFileSync(path.join(root, "devtools.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

class MockClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    if (force === true) {
      this.values.add(name);
      return true;
    }
    if (force === false) {
      this.values.delete(name);
      return false;
    }
    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }
    this.values.add(name);
    return true;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class MockElement {
  constructor(id) {
    this.id = id;
    this.dataset = {};
    this.classList = new MockClassList();
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this._innerHTML = "";
    this.checked = false;
    this.indeterminate = false;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  querySelectorAll() {
    return [];
  }

  closest() {
    return null;
  }
}

const ids = [
  "content",
  "recordToggle",
  "clearRequests",
  "filterToggle",
  "filterPanel",
  "filterInput",
  "preserveLog",
  "invertFilter",
  "excludeExtensionRequests",
  "statusFilter",
  "typeChips",
  "requestRows",
  "requestCount",
  "statusSummary",
  "selectedCount",
  "selectAll",
  "exportPane",
  "toggleExportPane",
  "selectDefaults",
  "selectFullFields",
  "includeSensitiveHeaders",
  "copyJson",
  "copyMarkdown",
  "statusMessage"
];

const elements = new Map(ids.map((id) => [id, new MockElement(id)]));
const fieldInputs = [
  "curlRequest",
  "statusCode",
  "responseBody",
  "url",
  "method",
  "name",
  "type",
  "size",
  "time",
  "initiator",
  "requestHeaders",
  "requestBody",
  "responseHeaders",
  "mimeType"
].map((field) => ({
  checked: ["curlRequest", "statusCode", "responseBody", "method"].includes(field),
  dataset: { field }
}));

const context = {
  console,
  TextDecoder,
  Uint8Array,
  URL,
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  navigator: {
    clipboard: {
      writeText: async () => undefined
    }
  },
  document: {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new MockElement(id));
      }
      return elements.get(id);
    },
    createElement(tagName) {
      return new MockElement(tagName);
    },
    querySelectorAll(selector) {
      if (selector === "[data-field]") {
        return fieldInputs;
      }
      return [];
    }
  }
};

context.globalThis = context;
vm.createContext(context);
vm.runInContext(sharedSource, context, { filename: "shared.js" });
vm.runInContext(panelSource, context, { filename: "panel.js" });

const logic = context.NetworkExporterInternals;
assert.ok(logic, "test internals should be exposed");
assert.deepStrictEqual(
  fieldInputs.filter((input) => input.checked).map((input) => input.dataset.field),
  ["curlRequest", "statusCode", "responseBody", "method"]
);

for (const input of fieldInputs) {
  input.checked = false;
}
elements.get("selectFullFields").listeners.click();
assert.ok(fieldInputs.every((input) => input.checked), "Full preset should select every export field");
elements.get("selectDefaults").listeners.click();
assert.deepStrictEqual(
  fieldInputs.filter((input) => input.checked).map((input) => input.dataset.field),
  ["curlRequest", "statusCode", "responseBody", "method"]
);

const entry = {
  _requestId: "123.1",
  _resourceType: "fetch",
  startedDateTime: "2026-06-08T10:00:00.000Z",
  time: 149,
  request: {
    method: "POST",
    url: "https://example.com/api/token",
    headers: [
      { name: "Authorization", value: "Bearer secret" },
      { name: "Cookie", value: "sid=secret" },
      { name: "Content-Type", value: "application/json" }
    ],
    postData: {
      text: "{\"grant\":\"demo\"}"
    }
  },
  response: {
    status: 200,
    statusText: "OK",
    headers: [
      { name: "Set-Cookie", value: "sid=secret" },
      { name: "Content-Type", value: "application/json" }
    ],
    bodySize: 17,
    headersSize: 50,
    content: {
      mimeType: "application/json",
      text: "{\"ok\":true}"
    }
  }
};

const request = logic.normalizeRequest(entry);
assert.strictEqual(request.id, "chrome:123.1");
assert.strictEqual(request.name, "token");
assert.strictEqual(request.method, "POST");
assert.strictEqual(request.statusCode, 200);
assert.strictEqual(request.typeGroup, "fetch-xhr");
assert.strictEqual(request.sizeBytes, 67);
assert.strictEqual(request.timeMs, 149);
assert.strictEqual(logic.isExtensionRequest(request), false);
assert.strictEqual(logic.getStatusClass(request), "");

const panelStoreCalls = {
  clear: 0,
  preserveLog: [],
  recording: []
};
const panelStore = {
  clear() {
    panelStoreCalls.clear += 1;
  },
  setPreserveLog(value) {
    panelStoreCalls.preserveLog.push(value);
  },
  setRecording(value) {
    panelStoreCalls.recording.push(value);
  },
  subscribe(listener) {
    listener({
      requests: [request],
      isRecording: true,
      preserveLog: false
    });

    return () => undefined;
  }
};

logic.attachNetworkExporterStore(panelStore);
assert.strictEqual(logic.state.requests.length, 1);
assert.strictEqual(logic.state.requests[0].url, "https://example.com/api/token");
assert.strictEqual(elements.get("preserveLog").checked, false);
elements.get("preserveLog").checked = true;
elements.get("preserveLog").listeners.change();
assert.deepStrictEqual(panelStoreCalls.preserveLog, [true]);
elements.get("recordToggle").listeners.click();
assert.deepStrictEqual(panelStoreCalls.recording, [false]);
elements.get("clearRequests").listeners.click();
assert.strictEqual(panelStoreCalls.clear, 1);
logic.applyCaptureSnapshot({
  requests: [request],
  isRecording: true,
  preserveLog: false
});

const clientErrorRequest = logic.normalizeRequest({
  ...entry,
  _requestId: "123.403",
  response: {
    ...entry.response,
    status: 403,
    statusText: "Forbidden"
  }
});
assert.strictEqual(logic.getStatusClass(clientErrorRequest), "status-client-error");

const serverErrorRequest = logic.normalizeRequest({
  ...entry,
  _requestId: "123.500",
  response: {
    ...entry.response,
    status: 500,
    statusText: "Internal Server Error"
  }
});
assert.strictEqual(logic.getStatusClass(serverErrorRequest), "status-server-error");

const failedRequest = logic.normalizeRequest({
  ...entry,
  _requestId: "123.failed",
  response: {
    ...entry.response,
    status: 0,
    statusText: ""
  }
});
assert.strictEqual(logic.getStatusClass(failedRequest), "status-failed");

const summary = logic.computeStatusSummary([request, clientErrorRequest, serverErrorRequest, failedRequest]);
assert.strictEqual(summary.clientErrors, 1);
assert.strictEqual(summary.serverErrors, 1);
assert.strictEqual(summary.failed, 1);
assert.strictEqual(summary.errors, 3);
logic.renderStatusSummary([request, clientErrorRequest, serverErrorRequest, failedRequest]);
assert.strictEqual(elements.get("statusSummary").children.length, 4);
assert.strictEqual(elements.get("statusSummary").children[0].children[1].textContent, "Errors: 3");

logic.state.requests = [request, clientErrorRequest, serverErrorRequest, failedRequest];
logic.state.statusFilter = "errors";
logic.state.filterText = "";
logic.state.activeType = "all";
logic.state.invertFilter = false;
logic.state.excludeExtensionRequests = true;
assert.strictEqual(logic.getVisibleRequests().length, 3);
assert.strictEqual(logic.matchesStatusFilter(request), false);
assert.strictEqual(logic.matchesStatusFilter(clientErrorRequest), true);
assert.strictEqual(logic.matchesStatusFilter(serverErrorRequest), true);
assert.strictEqual(logic.matchesStatusFilter(failedRequest), true);
logic.state.statusFilter = "";

elements.get("toggleExportPane").listeners.click();
assert.strictEqual(logic.state.isExportCollapsed, true);
assert.ok(elements.get("content").classList.contains("export-collapsed"));
assert.ok(elements.get("exportPane").classList.contains("collapsed"));
elements.get("toggleExportPane").listeners.click();
assert.strictEqual(logic.state.isExportCollapsed, false);

const extensionRequest = logic.normalizeRequest({
  ...entry,
  _requestId: "extension.1",
  request: {
    method: "GET",
    url: "chrome-extension://abc/default_config.content.json",
    headers: []
  },
  response: {
    status: 200,
    headers: [],
    content: {
      mimeType: "application/json",
      text: "{}"
    }
  }
});
assert.strictEqual(logic.isExtensionRequest(extensionRequest), true);

logic.state.requests = [extensionRequest, request];
logic.state.filterText = "api";
logic.state.activeType = "all";
logic.state.statusFilter = "";
logic.state.invertFilter = false;
logic.state.excludeExtensionRequests = true;
assert.strictEqual(logic.matchesFilterText(request), true);
assert.strictEqual(logic.getVisibleRequests().length, 1);

logic.state.excludeExtensionRequests = false;
logic.state.filterText = "";
assert.strictEqual(logic.getVisibleRequests().length, 2);
logic.state.excludeExtensionRequests = true;

logic.state.filterText = "method:post";
const exactFilter = logic.parseExactFilter("method:post");
assert.strictEqual(exactFilter.key, "method");
assert.strictEqual(exactFilter.value, "post");
assert.strictEqual(logic.matchesFilterText(request), true);

logic.state.filterText = "status-code:4";
assert.strictEqual(logic.matchesFilterText(request), false);

logic.state.filterText = "";
logic.state.statusFilter = "2";
assert.strictEqual(logic.matchesStatusFilter(request), true);
logic.state.statusFilter = "4";
assert.strictEqual(logic.matchesStatusFilter(request), false);

const safeExport = logic.buildExportObject(
  request,
  ["curlRequest", "requestHeaders", "responseHeaders", "statusCode", "responseBody", "url", "method"],
  { includeSensitive: false }
);
assert.strictEqual(safeExport.statusCode, 200);
assert.strictEqual(safeExport.responseBody, "{\"ok\":true}");
assert.strictEqual(safeExport.url, "https://example.com/api/token");
assert.strictEqual(safeExport.method, "POST");
assert.ok(!safeExport.curlRequest.includes("Authorization"));
assert.ok(!safeExport.curlRequest.includes("Cookie"));
assert.deepStrictEqual(Object.keys(safeExport.requestHeaders), ["Content-Type"]);
assert.deepStrictEqual(Object.keys(safeExport.responseHeaders), ["Content-Type"]);

assert.ok(logic.getDetailText(request, "headers").includes("Request Headers"));
assert.ok(logic.getDetailText(request, "headers").includes("Content-Type: application/json"));
assert.ok(logic.getDetailText(request, "payload").includes("\"grant\": \"demo\""));
assert.ok(logic.getDetailText(request, "response").includes("\"ok\": true"));
assert.ok(logic.getDetailText(request, "meta").includes("\"timeMs\": 149"));

const sensitiveExport = logic.buildExportObject(request, ["curlRequest", "requestHeaders", "responseHeaders"], {
  includeSensitive: true
});
assert.ok(sensitiveExport.curlRequest.includes("Authorization"));
assert.ok(sensitiveExport.curlRequest.includes("Cookie"));
assert.ok("Authorization" in sensitiveExport.requestHeaders);
assert.ok("Set-Cookie" in sensitiveExport.responseHeaders);

const decoded = logic.maybeDecodeResponseBody({
  responseBody: Buffer.from("hello 中文").toString("base64"),
  responseEncoding: "base64"
});
assert.strictEqual(decoded, "hello 中文");

const markdown = logic.toMarkdown([{ responseBody: "contains ``` fence" }], ["responseBody"]);
assert.ok(markdown.includes("````\ncontains ``` fence\n````"));

const devtoolsEntry = {
  ...entry,
  _requestId: "123.2",
  request: {
    ...entry.request,
    url: "https://example.com/api/from-har"
  },
  response: {
    ...entry.response,
    content: {
      mimeType: "application/json",
      text: "{\"fromHar\":true}"
    }
  }
};
const finishedEntry = {
  ...entry,
  _requestId: "123.3",
  request: {
    ...entry.request,
    url: "https://example.com/api/live"
  },
  response: {
    ...entry.response,
    content: {
      mimeType: "application/json",
      text: ""
    }
  },
  getContent(callback) {
    callback("{\"live\":true}", "");
  }
};
const afterNavigationEntry = {
  ...finishedEntry,
  _requestId: "123.4",
  request: {
    ...finishedEntry.request,
    url: "https://example.com/api/after-navigation"
  }
};
const pausedEntry = {
  ...finishedEntry,
  _requestId: "123.5",
  request: {
    ...finishedEntry.request,
    url: "https://example.com/api/paused"
  }
};
const devtoolsListeners = [];
const navigatedListeners = [];
let panelShownListener = null;
const devtoolsContext = {
  console,
  URL,
  chrome: {
    devtools: {
      network: {
        getHAR(callback) {
          callback({ entries: [devtoolsEntry] });
        },
        onRequestFinished: {
          addListener(listener) {
            devtoolsListeners.push(listener);
          }
        },
        onNavigated: {
          addListener(listener) {
            navigatedListeners.push(listener);
          }
        }
      },
      panels: {
        create(name, icon, page, callback) {
          assert.strictEqual(name, "Network Exporter");
          assert.strictEqual(page, "panel.html");
          callback({
            onShown: {
              addListener(listener) {
                panelShownListener = listener;
              }
            }
          });
        }
      }
    }
  }
};

devtoolsContext.globalThis = devtoolsContext;
vm.createContext(devtoolsContext);
vm.runInContext(sharedSource, devtoolsContext, { filename: "shared-devtools.js" });
vm.runInContext(devtoolsSource, devtoolsContext, { filename: "devtools.js" });
const captureStore = devtoolsContext.NetworkExporterCaptureStore;
let snapshot = captureStore.getSnapshot();
assert.strictEqual(snapshot.requests.length, 1);
assert.strictEqual(snapshot.requests[0].url, "https://example.com/api/from-har");
assert.strictEqual(devtoolsListeners.length, 1);
assert.strictEqual(navigatedListeners.length, 1);
assert.ok(panelShownListener);

devtoolsListeners[0](finishedEntry);
snapshot = captureStore.getSnapshot();
assert.strictEqual(snapshot.requests.length, 2);
const liveRequest = snapshot.requests.find((item) => item.url === "https://example.com/api/live");
assert.ok(liveRequest);
assert.strictEqual(liveRequest.responseBody, "{\"live\":true}");

navigatedListeners[0]("https://example.com/next");
snapshot = captureStore.getSnapshot();
assert.strictEqual(snapshot.requests.length, 0);

devtoolsListeners[0](afterNavigationEntry);
captureStore.setPreserveLog(true);
navigatedListeners[0]("https://example.com/preserved");
snapshot = captureStore.getSnapshot();
assert.strictEqual(snapshot.requests.length, 1);
assert.strictEqual(snapshot.requests[0].url, "https://example.com/api/after-navigation");

captureStore.setRecording(false);
devtoolsListeners[0](pausedEntry);
snapshot = captureStore.getSnapshot();
assert.strictEqual(snapshot.requests.length, 1);

const panelWindow = {
  attachNetworkExporterStore(store) {
    this.store = store;
  }
};
panelShownListener(panelWindow);
assert.strictEqual(panelWindow.store, captureStore);

console.log("panel-logic-ok");
