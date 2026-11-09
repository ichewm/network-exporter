"use strict";

// Clipboard fallback tests: when the async Clipboard API is blocked by a
// Permissions-Policy on an embedding document (e.g. DevTools inside an IDE
// webview — "The Clipboard API has been blocked because of a permissions
// policy applied to the current document"), the panel must fall back to the
// legacy document.execCommand("copy") path. Scenarios:
//
//   1. Healthy environment: writeText succeeds, execCommand never touched.
//   2. Policy-blocked environment: writeText rejects, execCommand succeeds,
//      the exact export text reaches the textarea, the textarea is cleaned up,
//      and the user still sees the success (copied) feedback.
//   3. Both paths fail (execCommand returns false / throws): the copy-failed
//      status is shown — never worse than the pre-fallback behavior.
//   4. Markdown export goes through the same fallback.
//   5. Helper mechanics: readonly + off-screen fixed textarea, select() called.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "panel.js"), "utf8");

const POLICY_ERROR_MESSAGE =
  "Failed to execute 'writeText' on 'Clipboard': The Clipboard API has been " +
  "blocked because of a permissions policy applied to the current document.";

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
  constructor(tagName) {
    this.tagName = tagName || "";
    this.dataset = {};
    this.classList = new MockClassList();
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.title = "";
    this.checked = false;
    this.value = "";
    this.style = {};
    this.attributes = {};
    this.parentNode = null;
    this.selectCalled = false;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  select() {
    this.selectCalled = true;
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

// clipboardImpl: async (text) => undefined (or throws)
// execResult: true | false | Error instance
function makePanelVm({ clipboardImpl, execResult }) {
  const elements = new Map(ids.map((id) => [id, new MockElement(id)]));
  const fieldInputs = ALL_FIELD_NAMES.map((field) => ({
    checked: DEFAULT_FIELDS.includes(field),
    dataset: { field }
  }));

  const calls = {
    writeText: [],
    execCommand: [],
    textareas: []
  };

  const document = {
    body: new MockElement("body"),
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new MockElement(id));
      }
      return elements.get(id);
    },
    createElement(tagName) {
      const element = new MockElement(tagName);
      if (tagName === "textarea") {
        calls.textareas.push(element);
      }
      return element;
    },
    createTextNode(text) {
      return { textContent: String(text) };
    },
    execCommand(command) {
      calls.execCommand.push(command);
      if (execResult instanceof Error) {
        throw execResult;
      }
      return execResult;
    },
    querySelectorAll(selector) {
      if (selector === "[data-field]") {
        return fieldInputs;
      }
      return [];
    }
  };

  const context = {
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    navigator: {
      clipboard: {
        writeText: async (text) => {
          calls.writeText.push(text);
          return clipboardImpl(text);
        }
      }
    },
    document,
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

  return { context, elements, calls, document };
}

function notAllowedError(message) {
  const error = new Error(message);
  error.name = "NotAllowedError";
  return error;
}

async function clickAndSettle(element) {
  element.listeners.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeSelectedSession(vm) {
  const logic = vm.context.NetworkExporterInternals;
  const entry = {
    _requestId: "1.1",
    request: { method: "POST", url: "https://example.com/api/users", headers: [] },
    response: { status: 201, headers: [], content: { mimeType: "application/json", text: "{\"ok\":true}" } }
  };
  const request = logic.normalizeRequest(entry);
  logic.state.requests = [request];
  logic.state.selectedIds = new Set([request.id]);
  return { logic, request };
}

async function driveCopy(vm, buttonId) {
  await clickAndSettle(vm.elements.get(buttonId));
}

// ===== 1. Healthy environment: primary path only =====
(async () => {
const healthy = makePanelVm({ clipboardImpl: () => undefined, execResult: true });
const healthySession = makeSelectedSession(healthy);
await driveCopy(healthy, "copyJson");
assert.strictEqual(healthy.calls.writeText.length, 1, "writeText called once");
assert.ok(healthy.calls.writeText[0].includes("https://example.com/api/users"));
assert.strictEqual(healthy.calls.execCommand.length, 0, "execCommand must not run when the async API works");
assert.strictEqual(healthy.calls.textareas.length, 0, "no fallback textarea created");
assert.strictEqual(healthy.document.body.children.length, 0, "body untouched");
assert.ok(healthy.elements.get("statusMessage").children.length > 0, "success feedback rendered");
assert.ok(!healthy.elements.get("statusMessage").textContent.includes("msg_copy_failed"));

// ===== 2. Policy-blocked: fallback rescues the copy =====
const blocked = makePanelVm({
  clipboardImpl: () => {
    throw notAllowedError(POLICY_ERROR_MESSAGE);
  },
  execResult: true
});
const blockedSession = makeSelectedSession(blocked);
await driveCopy(blocked, "copyJson");
assert.strictEqual(blocked.calls.writeText.length, 1, "primary path attempted");
assert.strictEqual(blocked.calls.execCommand.length, 1, "exactly one execCommand fallback");
assert.strictEqual(blocked.calls.execCommand[0], "copy");
assert.strictEqual(blocked.calls.textareas.length, 1, "one fallback textarea");
const fallbackTextarea = blocked.calls.textareas[0];
assert.strictEqual(
  fallbackTextarea.value,
  blocked.calls.writeText[0],
  "fallback textarea received the exact export text"
);
assert.ok(fallbackTextarea.selectCalled, "textarea content selected for copy");
assert.strictEqual(fallbackTextarea.attributes.readonly, "", "readonly set to avoid mobile keyboard");
assert.strictEqual(fallbackTextarea.style.position, "fixed", "off-screen fixed positioning");
assert.strictEqual(blocked.document.body.children.length, 0, "textarea removed after copy");
assert.ok(blocked.elements.get("statusMessage").children.length > 0, "success feedback still rendered");
assert.ok(!blocked.elements.get("statusMessage").textContent.includes("msg_copy_failed"));

// ===== 3a. Both paths fail (execCommand returns false) =====
const bothFail = makePanelVm({
  clipboardImpl: () => {
    throw notAllowedError(POLICY_ERROR_MESSAGE);
  },
  execResult: false
});
makeSelectedSession(bothFail);
await driveCopy(bothFail, "copyJson");
assert.strictEqual(bothFail.calls.execCommand.length, 1);
assert.strictEqual(bothFail.elements.get("statusMessage").textContent, `msg_copy_failed(${POLICY_ERROR_MESSAGE})`);
assert.strictEqual(bothFail.document.body.children.length, 0, "textarea cleaned up even on failure");

// ===== 3b. execCommand throws =====
const execThrows = makePanelVm({
  clipboardImpl: () => {
    throw notAllowedError("Failed to execute 'writeText' on 'Clipboard': Write permission denied.");
  },
  execResult: new Error("execCommand unavailable")
});
makeSelectedSession(execThrows);
await driveCopy(execThrows, "copyJson");
assert.ok(execThrows.elements.get("statusMessage").textContent.startsWith("msg_copy_failed"),
  "failure surfaces to the user, never an unhandled rejection");
assert.strictEqual(execThrows.document.body.children.length, 0, "cleanup runs even when execCommand throws");

// ===== 4. Markdown export uses the same fallback =====
const markdown = makePanelVm({
  clipboardImpl: () => {
    throw notAllowedError(POLICY_ERROR_MESSAGE);
  },
  execResult: true
});
makeSelectedSession(markdown);
await driveCopy(markdown, "copyMarkdown");
assert.strictEqual(markdown.calls.writeText.length, 1);
assert.strictEqual(markdown.calls.execCommand.length, 1, "markdown copy rescued by fallback too");
assert.ok(markdown.calls.writeText[0].includes("## Request 1"), "markdown export produced");
assert.ok(markdown.elements.get("statusMessage").children.length > 0, "success feedback rendered");

// ===== 5. Helper direct drive: always cleans up, bool result =====
const helperVm = makePanelVm({ clipboardImpl: () => undefined, execResult: true });
const helper = helperVm.context.NetworkExporterInternals.copyViaExecCommand;
assert.strictEqual(helper("hello"), true);
assert.strictEqual(helperVm.document.body.children.length, 0);
helperVm.document.execCommand = () => false;
assert.strictEqual(helper("hello"), false, "false propagates as failure");
helperVm.document.execCommand = () => {
  throw new Error("boom");
};
assert.strictEqual(helper("hello"), false, "throw propagates as failure");
assert.strictEqual(helperVm.document.body.children.length, 0, "no DOM leakage across failures");

console.log("clipboard-fallback-ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
