"use strict";

// Export field order tests: users can reorder export fields with ← → buttons
// (single step) and chip drag (long distance). The checked fields' relative
// order drives JSON key order and Markdown section order; only that order is
// persisted (unchecked positions are session cosmetics and fall back to
// canonical order on restore).

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

const CANONICAL = [
  "curlRequest", "statusCode", "responseBody", "method", "url", "name", "type",
  "size", "time", "initiator", "requestHeaders", "requestBody", "responseHeaders", "mimeType"
];
const DEFAULT_CHECKED = ["curlRequest", "statusCode", "responseBody", "method"];

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
  add(name) {
    this.values.add(name);
  }
  remove(name) {
    this.values.delete(name);
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
  constructor() {
    this.dataset = {};
    this.classList = new MockClassList();
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.checked = false;
    this.value = "";
    this.style = {};
    this.disabled = false;
    this.attributes = {};
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }
}

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
  const fieldInputs = CANONICAL.map((field) => ({
    checked: DEFAULT_CHECKED.includes(field),
    dataset: { field }
  }));
  // Mock chips so renderOrderBadges / updateMoveButtonStates operate on real
  // structures: each chip carries an order badge and two move buttons.
  const chips = CANONICAL.map((field) => {
    const badge = { textContent: "" };
    return {
      dataset: { fieldName: field },
      classList: new MockClassList(),
      badge,
      querySelector(selector) {
        return selector === ".field-order-badge" ? badge : null;
      }
    };
  });
  const moveButtons = [];
  for (const chip of chips) {
    for (const direction of ["up", "down"]) {
      moveButtons.push({ dataset: { move: direction, fieldName: chip.dataset.fieldName }, disabled: false });
    }
  }
  const fieldListElement = elements.get("fieldList");
  fieldListElement.querySelectorAll = (selector) => {
    if (selector === ".field-chip") {
      return chips.slice();
    }
    if (selector === "[data-move]") {
      return moveButtons.slice();
    }
    return [];
  };
  fieldListElement.appendChild = () => {};

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
      createTextNode(text) {
        return { textContent: String(text) };
      },
      querySelectorAll(selector) {
        if (selector === "[data-field]") {
          return fieldInputs;
        }
        return [];
      }
    },
    chrome: {
      i18n: {
        getMessage(key, args) {
          if (Array.isArray(args) && args.length) {
            return key + "(" + args.join(",") + ")";
          }
          return key;
        }
      }
    }
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(sharedSource, context, { filename: "shared.js" });
  vm.runInContext(panelSource, context, { filename: "panel.js" });

  return { context, elements, fieldInputs, chips };
}

function readSettings(storage) {
  const raw = storage.getItem("networkExporter.settings.v1");
  assert.ok(raw, "settings must have been persisted");
  return JSON.parse(raw);
}

function snapshotSettings(storage) {
  return storage.getItem("networkExporter.settings.v1");
}

// VM-context arrays carry the VM's Array.prototype, which host-side
// deepStrictEqual rejects. Convert before comparing.
function host(array) {
  return Array.from(array || []);
}

function fakeMoveButton(field, direction, disabled = false) {
  return { dataset: { move: direction, fieldName: field }, disabled };
}

// ===== 1. Fresh install: canonical order everywhere =====
const storageA = new MockStorage();
const sessionA = makePanelVm(storageA);
const logicA = sessionA.context.NetworkExporterInternals;
assert.deepStrictEqual(host(logicA.state.fieldOrder), CANONICAL, "fresh install uses canonical order");
assert.deepStrictEqual(
  host(logicA.getFieldInputs().map((input) => input.dataset.field)),
  CANONICAL
);
assert.deepStrictEqual(
  host(logicA.getFieldInputs().filter((input) => input.checked).map((input) => input.dataset.field)),
  DEFAULT_CHECKED
);
assert.strictEqual(storageA.getItem("networkExporter.settings.v1"), null, "no write before user action");

(async () => {
// ===== 2. Move button: single step + immediate persistence =====
// url is unchecked at index 4; move it one step up (in front of method).
sessionA.elements.get("fieldList").listeners.click({
  target: { closest: () => fakeMoveButton("url", "up") }
});
assert.deepStrictEqual(
  host(logicA.state.fieldOrder.slice(0, 6)),
  ["curlRequest", "statusCode", "responseBody", "url", "method", "name"],
  "url moved one step up in the UI order"
);
// Unchecked fields never appear in exportFields — moving one must not change
// the persisted export order at all.
assert.deepStrictEqual(readSettings(storageA).exportFields, DEFAULT_CHECKED,
  "moving an unchecked field does not touch the persisted export order");

// ===== 3. Boundary: no-op writes nothing =====
let before = snapshotSettings(storageA);
assert.strictEqual(logicA.moveFieldBy("curlRequest", -1), false, "first field cannot move up");
assert.strictEqual(logicA.moveFieldBy("mimeType", 1), false, "last field cannot move down");
sessionA.elements.get("fieldList").listeners.click({
  target: { closest: () => fakeMoveButton("curlRequest", "up", true) }
});
assert.strictEqual(snapshotSettings(storageA), before, "boundary clicks never write storage");
// clamp semantics
assert.strictEqual(logicA.moveFieldTo("mimeType", -99), true);
assert.strictEqual(logicA.state.fieldOrder[0], "mimeType", "target index clamped to 0");
assert.strictEqual(logicA.moveFieldTo("mimeType", 999) === false || logicA.state.fieldOrder[13] === "mimeType", true);

// ===== 4. Checked order drives export: JSON keys + Markdown sections =====
// Check url, then move it in front of curlRequest.
const urlInput = sessionA.fieldInputs.find((input) => input.dataset.field === "url");
urlInput.checked = true;
sessionA.elements.get("fieldList").listeners.change({
  target: { dataset: { field: "url" }, checked: true }
});
logicA.moveFieldTo("url", 0);
assert.deepStrictEqual(readSettings(storageA).exportFields,
  ["url", "curlRequest", "statusCode", "responseBody", "method"],
  "persisted export order follows the user's checked-field order");

const entry = {
  _requestId: "1.1",
  request: { method: "POST", url: "https://example.com/api/users", headers: [] },
  response: { status: 201, headers: [], content: { mimeType: "application/json", text: "{\"ok\":true}" } }
};
const request = logicA.normalizeRequest(entry);
logicA.state.requests = [request];
logicA.state.selectedIds = new Set([request.id]);

// JSON: key order follows the user's order
const copiedJson = [];
sessionA.context.navigator.clipboard.writeText = async (text) => {
  copiedJson.push(text);
};
sessionA.elements.get("copyJson").listeners.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.strictEqual(copiedJson.length, 1);
assert.deepStrictEqual(
  Object.keys(JSON.parse(copiedJson[0])[0]),
  ["url", "curlRequest", "statusCode", "responseBody", "method"],
  "JSON keys exported in the user's field order"
);

// Markdown: ### section order follows the user's order
const copiedMarkdown = [];
sessionA.context.navigator.clipboard.writeText = async (text) => {
  copiedMarkdown.push(text);
};
sessionA.elements.get("copyMarkdown").listeners.click();
await new Promise((resolve) => setTimeout(resolve, 0));
const headings = copiedMarkdown[0].split("\n").filter((line) => line.startsWith("### "));
assert.deepStrictEqual(
  headings,
  ["### url", "### curlRequest", "### statusCode", "### responseBody", "### method"],
  "Markdown sections exported in the user's field order"
);

// ===== 5. Restart: checked order restored, unchecked falls back to canonical tail =====
const sessionB = makePanelVm(storageA);
const logicB = sessionB.context.NetworkExporterInternals;
assert.deepStrictEqual(
  host(logicB.state.fieldOrder.slice(0, 5)),
  ["url", "curlRequest", "statusCode", "responseBody", "method"],
  "checked order restored from persisted export order"
);
const tail = host(logicB.state.fieldOrder.slice(5));
assert.deepStrictEqual(tail.sort(), CANONICAL.filter((f) => !["url", "curlRequest", "statusCode", "responseBody", "method"].includes(f)).sort(),
  "unchecked fields fall back to the canonical set");
assert.deepStrictEqual(
  host(logicB.getFieldInputs().filter((input) => input.checked).map((input) => input.dataset.field)),
  ["url", "curlRequest", "statusCode", "responseBody", "method"],
  "checked selection restored in order"
);

// ===== 6. Presets =====
// Defaults: default set AND canonical order.
sessionB.elements.get("selectDefaults").listeners.click();
assert.deepStrictEqual(host(logicB.state.fieldOrder), CANONICAL, "Defaults restores canonical order");
assert.deepStrictEqual(readSettings(storageA).exportFields, DEFAULT_CHECKED);

// Full: keeps the user's order, just checks everything.
logicB.moveFieldTo("responseHeaders", 0);
const orderBeforeFull = Array.from(logicB.state.fieldOrder);
sessionB.elements.get("selectFullFields").listeners.click();
assert.deepStrictEqual(host(logicB.state.fieldOrder), orderBeforeFull, "Full keeps the current order");
assert.deepStrictEqual(readSettings(storageA).exportFields, orderBeforeFull,
  "Full persists all fields in the current order");

// ===== 7. No drag affordances + ordinal badges =====
const storageC = new MockStorage();
const sessionC = makePanelVm(storageC);
const logicC = sessionC.context.NetworkExporterInternals;
const fieldListC = sessionC.elements.get("fieldList");

// Drag was removed in favor of numbered pills: no DnD listeners at all.
assert.ok(!("dragstart" in fieldListC.listeners), "no dragstart listener");
assert.ok(!("dragover" in fieldListC.listeners), "no dragover listener");
assert.ok(!("drop" in fieldListC.listeners), "no drop listener");
assert.ok(!("dragend" in fieldListC.listeners), "no dragend listener");

// Fresh install: default checked fields numbered 1-4, unchecked unnumbered.
assert.deepStrictEqual(
  host(logicC.getOrderBadges()).map((badge) => [badge.field, badge.ordinal]),
  [
    ["curlRequest", 1], ["statusCode", 2], ["responseBody", 3], ["method", 4],
    ["url", 0], ["name", 0], ["type", 0], ["size", 0], ["time", 0],
    ["initiator", 0], ["requestHeaders", 0], ["requestBody", 0],
    ["responseHeaders", 0], ["mimeType", 0]
  ],
  "badges number checked fields in export order"
);

// Reordering renumbers: move unchecked responseHeaders to front, then check it
// → it becomes #1 and the rest shift.
logicC.moveFieldTo("responseHeaders", 0);
const responseHeadersInput = sessionC.fieldInputs.find((input) => input.dataset.field === "responseHeaders");
responseHeadersInput.checked = true;
fieldListC.listeners.change({ target: { dataset: { field: "responseHeaders" } } });
assert.deepStrictEqual(
  host(logicC.getOrderBadges()).map((badge) => [badge.field, badge.ordinal]).slice(0, 5),
  [["responseHeaders", 1], ["curlRequest", 2], ["statusCode", 3], ["responseBody", 4], ["method", 5]],
  "badges renumber after a move plus a new selection"
);
assert.deepStrictEqual(readSettings(storageC).exportFields,
  ["responseHeaders", "curlRequest", "statusCode", "responseBody", "method"],
  "persistence matches the badge order");

// Unchecking compacts the numbers again.
const statusCodeInput = sessionC.fieldInputs.find((input) => input.dataset.field === "statusCode");
statusCodeInput.checked = false;
fieldListC.listeners.change({ target: { dataset: { field: "statusCode" } } });
assert.deepStrictEqual(
  host(logicC.getOrderBadges()).map((badge) => [badge.field, badge.ordinal]).slice(0, 5),
  [["responseHeaders", 1], ["curlRequest", 2], ["statusCode", 0], ["responseBody", 3], ["method", 4]],
  "unchecking compacts the ordinals"
);

// ===== 8. Preset badge rendering on the DOM chips (Full/Defaults) =====
const storageD = new MockStorage();
const sessionD = makePanelVm(storageD);
const logicD = sessionD.context.NetworkExporterInternals;

// Fresh install: default fields numbered 1-4, unchecked dimmed and unnumbered.
const badgeText = () => sessionD.chips.map((chip) => chip.badge.textContent);
const dimmed = () => sessionD.chips.filter((chip) => chip.classList.contains("unchecked")).map((chip) => chip.dataset.fieldName);
assert.deepStrictEqual(badgeText(), ["1", "2", "3", "4", "", "", "", "", "", "", "", "", "", ""]);
assert.deepStrictEqual(dimmed(), CANONICAL.slice(4));

// Full: every pill numbered, nothing dimmed — regression for the bug where
// programmatic checked changes skipped renderOrderBadges and left pills gray.
sessionD.elements.get("selectFullFields").listeners.click();
assert.deepStrictEqual(badgeText(), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
  "Full numbers every pill");
assert.deepStrictEqual(dimmed(), [], "Full clears all dimming");

// Defaults: back to 1-4, the rest dimmed again.
sessionD.elements.get("selectDefaults").listeners.click();
assert.deepStrictEqual(badgeText(), ["1", "2", "3", "4", "", "", "", "", "", "", "", "", "", ""]);
assert.deepStrictEqual(dimmed(), CANONICAL.slice(4));

// ===== 9. All 14 inputs stay addressable regardless of order =====
assert.strictEqual(logicC.getFieldInputs().length, CANONICAL.length);
assert.deepStrictEqual(
  host(logicC.getFieldInputs().map((input) => input.dataset.field)).sort(),
  CANONICAL.slice().sort(),
  "no field lost after reordering"
);

console.log("export-field-order-ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
