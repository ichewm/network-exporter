"use strict";

// Persistence tests: user preferences survive a simulated browser restart,
// while recording state and the sensitive-headers toggle deliberately do not.
//
// What must persist (parity with Chrome DevTools' Network panel settings):
//   preserve log, invert, exclude extensions, filter text, type chip,
//   status filter, collapsed export pane, export fields, truncation toggle.
// What must NOT persist:
//   recording state (always restarts recording, like DevTools' session-scoped
//   record toggle), include-sensitive-headers (leak safety), selection,
//   active request, captured requests.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const devtoolsSource = fs.readFileSync(path.join(root, "devtools.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

const SETTINGS_KEY = "networkExporter.settings.v1";

class MockStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

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

  add(name) {
    this.values.add(name);
  }
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

const ALL_FIELD_NAMES = [
  "curlRequest", "statusCode", "responseBody", "method", "url", "name", "type",
  "size", "time", "initiator", "requestHeaders", "requestBody", "responseHeaders", "mimeType"
];
const DEFAULT_FIELDS = ["curlRequest", "statusCode", "responseBody", "method"];

const ids = [
  "content", "recordToggle", "clearRequests", "filterToggle", "filterPanel",
  "filterInput", "preserveLog", "invertFilter", "excludeExtensionRequests",
  "statusFilter", "typeChips", "requestRows", "requestCount", "statusSummary",
  "selectedCount", "selectAll", "detailTabs", "detailName", "detailUrl",
  "detailContent", "exportPane", "toggleExportPane", "selectDefaults",
  "selectFullFields", "includeSensitiveHeaders", "truncateLargeBodies",
  "fieldList", "copyJson", "copyMarkdown", "statusMessage"
];

function makePanelVm(storage) {
  const elements = new Map(ids.map((id) => [id, new MockElement()]));
  const fieldInputs = ALL_FIELD_NAMES.map((field) => ({
    checked: DEFAULT_FIELDS.includes(field),
    dataset: { field }
  }));

  const context = {
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    localStorage: storage,
    navigator: { clipboard: { writeText: async () => undefined } },
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, new MockElement());
        }
        return elements.get(id);
      },
      createElement() {
        return new MockElement();
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

  return { context, elements, fieldInputs };
}

function makeDevtoolsVm(storage) {
  const listeners = { finished: [], navigated: [], storage: null };
  const ctx = {
    console,
    TextDecoder,
    TextEncoder,
    URL,
    localStorage: storage,
    addEventListener(type, listener) {
      listeners.storage = { type, listener };
    },
    chrome: {
      devtools: {
        network: {
          getHAR(cb) {
            cb({ entries: [] });
          },
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

function readSavedSettings(storage) {
  const raw = storage.getItem(SETTINGS_KEY);
  assert.ok(raw, "settings should have been written to storage");
  return JSON.parse(raw);
}

// ===== 1. Fresh install: storage empty → factory defaults in state + UI =====
const storageA = new MockStorage();
const sessionA = makePanelVm(storageA);
assert.strictEqual(sessionA.context.NetworkExporterInternals.state.invertFilter, false);
assert.strictEqual(sessionA.context.NetworkExporterInternals.state.excludeExtensionRequests, true);
assert.strictEqual(sessionA.context.NetworkExporterInternals.state.activeType, "all");
assert.strictEqual(sessionA.context.NetworkExporterInternals.state.statusFilter, "");
assert.strictEqual(sessionA.context.NetworkExporterInternals.state.isExportCollapsed, false);
assert.strictEqual(sessionA.context.NetworkExporterInternals.state.preserveLog, false);
assert.strictEqual(sessionA.elements.get("truncateLargeBodies").checked, true);
assert.deepStrictEqual(
  sessionA.fieldInputs.filter((input) => input.checked).map((input) => input.dataset.field),
  DEFAULT_FIELDS
);
assert.strictEqual(storageA.getItem(SETTINGS_KEY), null, "no writes before any user action");

// ===== 2. First session: user actions persist immediately =====
const logicA = sessionA.context.NetworkExporterInternals;

// preserve log on (standalone panel, no capture store yet)
sessionA.elements.get("preserveLog").checked = true;
sessionA.elements.get("preserveLog").listeners.change();
assert.strictEqual(logicA.state.preserveLog, true);

// invert on
sessionA.elements.get("invertFilter").checked = true;
sessionA.elements.get("invertFilter").listeners.change();

// exclude extensions off
sessionA.elements.get("excludeExtensionRequests").checked = false;
sessionA.elements.get("excludeExtensionRequests").listeners.change();

// filter text (raw input is persisted; state keeps trimmed lowercase)
sessionA.elements.get("filterInput").value = "  Api/Users ";
sessionA.elements.get("filterInput").listeners.input();
assert.strictEqual(logicA.state.filterText, "api/users");

// status filter 4xx
sessionA.elements.get("statusFilter").value = "4";
sessionA.elements.get("statusFilter").listeners.change();

// type chip: Fetch/XHR
const fakeChip = { dataset: { type: "fetch-xhr" }, classList: new MockClassList() };
sessionA.elements.get("typeChips").listeners.click({ target: { closest: () => fakeChip } });
assert.strictEqual(logicA.state.activeType, "fetch-xhr");

// collapse export pane
sessionA.elements.get("toggleExportPane").listeners.click();
assert.strictEqual(logicA.state.isExportCollapsed, true);

// truncate off
sessionA.elements.get("truncateLargeBodies").checked = false;
sessionA.elements.get("truncateLargeBodies").listeners.change();

// export field change: uncheck statusCode, check url, then notify via fieldList
sessionA.fieldInputs.find((input) => input.dataset.field === "statusCode").checked = false;
sessionA.fieldInputs.find((input) => input.dataset.field === "url").checked = true;
sessionA.elements.get("fieldList").listeners.change({ target: { dataset: { field: "url" }, checked: true } });

// sensitive headers ON — must never be persisted
sessionA.elements.get("includeSensitiveHeaders").checked = true;

const saved = readSavedSettings(storageA);
assert.strictEqual(saved.preserveLog, true);
assert.strictEqual(saved.invertFilter, true);
assert.strictEqual(saved.excludeExtensionRequests, false);
assert.strictEqual(saved.filterText, "  Api/Users ");
assert.strictEqual(saved.statusFilter, "4");
assert.strictEqual(saved.activeType, "fetch-xhr");
assert.strictEqual(saved.isExportCollapsed, true);
assert.strictEqual(saved.truncateLargeBodies, false);
assert.deepStrictEqual(saved.exportFields, ["curlRequest", "responseBody", "method", "url"]);
assert.ok(!("includeSensitiveHeaders" in saved), "sensitive-headers toggle must never be persisted");
assert.ok(!JSON.stringify(saved).includes("isRecording"), "recording state must never be persisted");
assert.ok(!JSON.stringify(saved).includes("selectedIds"), "selection must never be persisted");

// ===== 3. Simulated restart: fresh panel vm, same storage → everything restored =====
const sessionB = makePanelVm(storageA);
const logicB = sessionB.context.NetworkExporterInternals;
assert.strictEqual(logicB.state.preserveLog, true, "preserve log restored");
assert.strictEqual(sessionB.elements.get("preserveLog").checked, true);
assert.strictEqual(logicB.state.invertFilter, true);
assert.strictEqual(sessionB.elements.get("invertFilter").checked, true);
assert.strictEqual(logicB.state.excludeExtensionRequests, false);
assert.strictEqual(sessionB.elements.get("excludeExtensionRequests").checked, false);
assert.strictEqual(sessionB.elements.get("filterInput").value, "  Api/Users ");
assert.strictEqual(logicB.state.filterText, "api/users", "restored filter text is normalized");
assert.strictEqual(logicB.state.statusFilter, "4");
assert.strictEqual(sessionB.elements.get("statusFilter").value, "4");
assert.strictEqual(logicB.state.activeType, "fetch-xhr");
assert.strictEqual(logicB.state.isExportCollapsed, true);
assert.ok(sessionB.elements.get("exportPane").classList.contains("collapsed"));
assert.strictEqual(sessionB.elements.get("truncateLargeBodies").checked, false);
assert.deepStrictEqual(
  sessionB.fieldInputs.filter((input) => input.checked).map((input) => input.dataset.field),
  ["curlRequest", "responseBody", "method", "url"],
  "export field selection restored"
);
assert.strictEqual(sessionB.elements.get("includeSensitiveHeaders").checked, false,
  "sensitive headers must restart unchecked even if it was on when the session ended");
assert.strictEqual(logicB.state.isRecording, true, "recording always restarts on");

// ===== 4. Corrupt / hostile storage → sanitized to defaults =====
const corruptStorage = new MockStorage();
corruptStorage.setItem(SETTINGS_KEY, "{not valid json");
const sessionCorrupt = makePanelVm(corruptStorage);
assert.strictEqual(sessionCorrupt.context.NetworkExporterInternals.state.activeType, "all");
assert.strictEqual(sessionCorrupt.context.NetworkExporterInternals.state.invertFilter, false);

const hostileStorage = new MockStorage();
hostileStorage.setItem(SETTINGS_KEY, JSON.stringify({
  preserveLog: "yes",
  invertFilter: 1,
  excludeExtensionRequests: null,
  filterText: 42,
  activeType: "<script>",
  statusFilter: "9",
  isExportCollapsed: [],
  truncateLargeBodies: "no",
  exportFields: ["url", "evil-field", "url", 7]
}));
const sessionHostile = makePanelVm(hostileStorage);
const logicH = sessionHostile.context.NetworkExporterInternals;
assert.strictEqual(logicH.state.preserveLog, false, "non-boolean falls back to default");
assert.strictEqual(logicH.state.invertFilter, false);
assert.strictEqual(logicH.state.excludeExtensionRequests, true);
assert.strictEqual(logicH.state.filterText, "");
assert.strictEqual(logicH.state.activeType, "all", "unknown type group rejected");
assert.strictEqual(logicH.state.statusFilter, "", "unknown status filter rejected");
assert.strictEqual(logicH.state.isExportCollapsed, false);
assert.strictEqual(sessionHostile.elements.get("truncateLargeBodies").checked, true);
assert.deepStrictEqual(
  sessionHostile.fieldInputs.filter((input) => input.checked).map((input) => input.dataset.field),
  ["url"],
  "valid export fields kept, unknown ones dropped, duplicates ignored"
);

// all-invalid field list → falls back to defaults
const noFieldsStorage = new MockStorage();
noFieldsStorage.setItem(SETTINGS_KEY, JSON.stringify({ exportFields: ["evil-field", 7, null] }));
const sessionNoFields = makePanelVm(noFieldsStorage);
assert.deepStrictEqual(
  sessionNoFields.fieldInputs.filter((input) => input.checked).map((input) => input.dataset.field),
  DEFAULT_FIELDS,
  "empty-after-sanitizing export fields fall back to defaults"
);

// ===== 5. devtools.js capture store: persist + restore + cross-window sync =====
const devtoolsStorage = new MockStorage();
devtoolsStorage.setItem(SETTINGS_KEY, JSON.stringify({ preserveLog: true, invertFilter: true }));

// 5a. restore happens at DevTools open, before the panel is ever shown
const devtoolsA = makeDevtoolsVm(devtoolsStorage);
let snap = devtoolsA.store.getSnapshot();
assert.strictEqual(snap.preserveLog, true, "preserve log restored before panel is selected");
assert.strictEqual(snap.isRecording, true, "recording always starts on");

// 5b. navigation keeps requests when restored preserve log is on
const entry = {
  _requestId: "1.1",
  request: { method: "GET", url: "https://example.com/a", headers: [] },
  response: { status: 200, headers: [], content: { mimeType: "text/plain", text: "x" } }
};
devtoolsA.listeners.finished[0](entry);
devtoolsA.listeners.navigated[0]("https://example.com/next");
snap = devtoolsA.store.getSnapshot();
assert.strictEqual(snap.requests.length, 1, "restored preserve log protects requests across navigation");

// 5c. toggling via the store persists
devtoolsA.store.setPreserveLog(false);
assert.strictEqual(readSavedSettings(devtoolsStorage).preserveLog, false);
devtoolsA.store.setRecording(false);
assert.ok(!JSON.stringify(readSavedSettings(devtoolsStorage)).includes("isRecording"),
  "setRecording must not persist anything");

// 5d. another DevTools window changes the setting → storage event syncs the live store
const devtoolsB = makeDevtoolsVm(new MockStorage());
assert.strictEqual(devtoolsB.listeners.storage?.type, "storage", "devtools page listens for storage events");
devtoolsB.ctx.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ preserveLog: true }));
devtoolsB.listeners.storage.listener({ key: SETTINGS_KEY });
snap = devtoolsB.store.getSnapshot();
assert.strictEqual(snap.preserveLog, true, "cross-window change picked up by the live store");
devtoolsB.listeners.storage.listener({ key: "someone-elses-key" });
devtoolsB.listeners.storage.listener({});
assert.strictEqual(devtoolsB.store.getSnapshot().preserveLog, true, "irrelevant events are ignored");

console.log("settings-persistence-ok");
