// Field label compaction (v0.6.2 UI optimization):
// 1. Long field names truncate to FIELD_NAME_MAX_CHARS glyphs + inline "…".
// 2. Short names (<= 6 glyphs, e.g. "method", "url") stay whole.
// 3. renderFieldNames is idempotent — re-running never re-truncates.
// 4. Chips without a .field-name span (legacy/foreign markup) are skipped.
// 5. The truncation is purely cosmetic: data-field identities, order badges,
//    and everything exports rely on are untouched.

"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

const CANONICAL = [
  "curlRequest", "statusCode", "responseBody", "method", "url", "name", "type",
  "size", "time", "initiator", "requestHeaders", "requestBody", "responseHeaders", "mimeType"
];
const DEFAULT_CHECKED = ["curlRequest", "statusCode", "responseBody", "method"];
const EXPECTED_LABELS = [
  "curlRe…", "status…", "respon…", "method", "url", "name", "type",
  "size", "time", "initia…", "reques…", "reques…", "respon…", "mimeTy…"
];

class MockStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(name) {
    return this.map.has(name) ? this.map.get(name) : null;
  }
  setItem(name, value) {
    this.map.set(name, String(value));
  }
  removeItem(name) {
    this.map.delete(name);
  }
}

class MockClassList {
  constructor() {
    this.set = new Set();
  }
  add(name) {
    this.set.add(name);
  }
  remove(name) {
    this.set.delete(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : Boolean(force);
    if (on) {
      this.set.add(name);
    } else {
      this.set.delete(name);
    }
    return on;
  }
  contains(name) {
    return this.set.has(name);
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
    this.title = "";
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
  // Each chip carries a .field-name span seeded with the full field name —
  // exactly what the static panel.html ships. One extra bare chip (no span,
  // unknown field) proves the renderer tolerates markup it does not recognize.
  const chips = CANONICAL.map((field) => {
    const nameSpan = { textContent: field };
    const badge = { textContent: "" };
    return {
      dataset: { fieldName: field },
      classList: new MockClassList(),
      nameSpan,
      badge,
      querySelector(selector) {
        if (selector === ".field-name") {
          return nameSpan;
        }
        if (selector === ".field-order-badge") {
          return badge;
        }
        return null;
      }
    };
  });
  const bareChip = {
    dataset: { fieldName: "notARealField" },
    classList: new MockClassList(),
    querySelector() {
      return null;
    }
  };
  const allChips = chips.concat([bareChip]);
  const moveButtons = [];
  for (const chip of chips) {
    for (const direction of ["up", "down"]) {
      moveButtons.push({ dataset: { move: direction, fieldName: chip.dataset.fieldName }, disabled: false });
    }
  }
  const fieldListElement = elements.get("fieldList");
  fieldListElement.querySelectorAll = (selector) => {
    if (selector === ".field-chip") {
      return allChips.slice();
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

  return { context, elements, fieldInputs, chips, bareChip };
}

// VM-context arrays carry the VM's Array.prototype, which host-side
// deepStrictEqual rejects. Convert before comparing.
function host(array) {
  return Array.from(array || []);
}

// ===== 1. init() already ran renderFieldNames: labels are truncated =====
const session = makePanelVm(new MockStorage());
const internals = session.context.NetworkExporterInternals;
const visible = () => session.chips.map((chip) => chip.nameSpan.textContent);
assert.deepStrictEqual(visible(), EXPECTED_LABELS, "long names clamp to 6 glyphs + inline ellipsis");

// ===== 2. Idempotent: a second pass changes nothing =====
internals.renderFieldNames();
assert.deepStrictEqual(visible(), EXPECTED_LABELS, "re-running renderFieldNames is a no-op");

// ===== 3. Bare chip (no .field-name span) never throws and is skipped =====
internals.renderFieldNames();
assert.strictEqual(session.bareChip.classList.contains("unchecked"), false, "bare chip ignored by badge dimming");

// ===== 4. Cosmetic only: data-field identities untouched =====
assert.deepStrictEqual(
  host(internals.getFieldInputs()).map((input) => input.dataset.field),
  CANONICAL,
  "export field identities keep their full canonical names"
);

// ===== 5. Badge numbering still works alongside truncated labels =====
assert.deepStrictEqual(
  session.chips.map((chip) => chip.badge.textContent),
  ["1", "2", "3", "4", "", "", "", "", "", "", "", "", "", ""],
  "default checked fields numbered 1-4, unchecked unnumbered"
);

// ===== 6. Export order mapping is derived from data-field, not labels =====
assert.deepStrictEqual(
  host(internals.getOrderBadges()).map((badge) => [badge.field, badge.ordinal]),
  [
    ["curlRequest", 1], ["statusCode", 2], ["responseBody", 3], ["method", 4],
    ["url", 0], ["name", 0], ["type", 0], ["size", 0], ["time", 0],
    ["initiator", 0], ["requestHeaders", 0], ["requestBody", 0],
    ["responseHeaders", 0], ["mimeType", 0]
  ],
  "ordinal badges use full field names regardless of display labels"
);

console.log("10-field-label-truncation: all assertions passed");
