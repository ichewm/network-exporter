"use strict";

function t(key, ...args) {
  try {
    const chromeRef = globalThis.chrome;
    if (chromeRef?.i18n?.getMessage) {
      return chromeRef.i18n.getMessage(key, args) || key;
    }
  } catch {
    // Extension context invalidated (e.g. after reload); fall back to key.
  }
  return key;
}

function applyI18n(root) {
  const scope = root || document;
  for (const el of scope.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of scope.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of scope.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of scope.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  }
}

const SENSITIVE_HEADER_NAMES = NetworkExporterShared.SENSITIVE_HEADER_NAMES;
const MAX_EXPORT_BODY_BYTES = NetworkExporterShared.MAX_EXPORT_BODY_BYTES;
const isLikelyBinaryMimeType = NetworkExporterShared.isLikelyBinaryMimeType;
const truncateBody = NetworkExporterShared.truncateBody;
const clampStoredBody = NetworkExporterShared.clampStoredBody;
const requestNormalizer = NetworkExporterShared.createRequestNormalizer();
const getTypeGroup = NetworkExporterShared.getTypeGroup;

// Canonical field order: matches the panel.html field list and the Defaults
// preset. Drives initial layout, restore fallback, and Defaults reset.
const CANONICAL_FIELD_ORDER = [
  "curlRequest",
  "statusCode",
  "responseBody",
  "method",
  "url",
  "name",
  "type",
  "size",
  "time",
  "initiator",
  "requestHeaders",
  "requestBody",
  "responseHeaders",
  "mimeType"
];

const state = {
  requests: [],
  selectedIds: new Set(),
  isRecording: true,
  preserveLog: false,
  isExportCollapsed: false,
  activeType: "all",
  activeRequestId: "",
  activeDetailTab: "headers",
  filterText: "",
  invertFilter: false,
  excludeExtensionRequests: true,
  statusFilter: "",
  // UI row order of export fields; the export follows the checked fields'
  // relative order within this list.
  fieldOrder: CANONICAL_FIELD_ORDER.slice()
};

let captureStore = null;
let unsubscribeCaptureStore = null;

const els = {
  content: document.getElementById("content"),
  recordToggle: document.getElementById("recordToggle"),
  clearRequests: document.getElementById("clearRequests"),
  filterToggle: document.getElementById("filterToggle"),
  filterPanel: document.getElementById("filterPanel"),
  filterInput: document.getElementById("filterInput"),
  preserveLog: document.getElementById("preserveLog"),
  invertFilter: document.getElementById("invertFilter"),
  excludeExtensionRequests: document.getElementById("excludeExtensionRequests"),
  statusFilter: document.getElementById("statusFilter"),
  typeChips: document.getElementById("typeChips"),
  requestRows: document.getElementById("requestRows"),
  requestCount: document.getElementById("requestCount"),
  statusSummary: document.getElementById("statusSummary"),
  selectedCount: document.getElementById("selectedCount"),
  selectAll: document.getElementById("selectAll"),
  detailTabs: document.getElementById("detailTabs"),
  detailName: document.getElementById("detailName"),
  detailUrl: document.getElementById("detailUrl"),
  detailContent: document.getElementById("detailContent"),
  exportPane: document.getElementById("exportPane"),
  toggleExportPane: document.getElementById("toggleExportPane"),
  selectDefaults: document.getElementById("selectDefaults"),
  selectFullFields: document.getElementById("selectFullFields"),
  includeSensitiveHeaders: document.getElementById("includeSensitiveHeaders"),
  copyJson: document.getElementById("copyJson"),
  copyMarkdown: document.getElementById("copyMarkdown"),
  truncateLargeBodies: document.getElementById("truncateLargeBodies"),
  fieldList: document.getElementById("fieldList"),
  statusMessage: document.getElementById("statusMessage")
};

init();

function init() {
  bindEvents();

  try {
    applyI18n();
  } catch {
    // Extension context invalidated — fall back to raw data-i18n values.
  }

  applyPersistedSettingsToUi();

  if (globalThis.NetworkExporterPendingStore) {
    attachNetworkExporterStore(globalThis.NetworkExporterPendingStore);
    return;
  }

  render();
  updateCaptureControls();
  if (!hasDevToolsApi()) {
    setStatus(t("msg_open_in_devtools"));
  } else {
    try {
      if (!globalThis.chrome?.devtools?.network) {
        setStatus(t("msg_api_unavailable"));
        return;
      }
    } catch {
      // chrome access itself can throw when context is invalidated
    }
    setStatus(t("msg_waiting"));
  }
}

function hasDevToolsApi() {
  return Boolean(globalThis.chrome?.devtools);
}

function attachNetworkExporterStore(store) {
  if (!store || captureStore === store) {
    return;
  }

  if (unsubscribeCaptureStore) {
    unsubscribeCaptureStore();
  }

  captureStore = store;
  unsubscribeCaptureStore = captureStore.subscribe(applyCaptureSnapshot);
  setStatus("");
}

function applyCaptureSnapshot(snapshot) {
  const nextRequests = Array.isArray(snapshot.requests) ? snapshot.requests : [];
  const nextIds = new Set(nextRequests.map((request) => request.id));

  state.requests = nextRequests;
  state.isRecording = Boolean(snapshot.isRecording);
  state.preserveLog = Boolean(snapshot.preserveLog);

  for (const selectedId of Array.from(state.selectedIds)) {
    if (!nextIds.has(selectedId)) {
      state.selectedIds.delete(selectedId);
    }
  }

  if (state.activeRequestId && !nextIds.has(state.activeRequestId)) {
    state.activeRequestId = "";
  }

  updateCaptureControls();
  render();
}

function updateCaptureControls() {
  els.recordToggle.classList.toggle("active", state.isRecording);
  els.recordToggle.title = state.isRecording ? t("pause_title") : t("record_title");
  els.recordToggle.setAttribute("aria-label", els.recordToggle.title);
  els.preserveLog.checked = state.preserveLog;
}

function getSettingsStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

// Restores persisted preferences into state + UI. Mirrors Chrome DevTools,
// which persists long-lived Network panel preferences (preserve log, invert,
// hide extensions, filter text, type filters) across browser restarts.
//
// Deliberately NOT restored:
// - includeSensitiveHeaders: always starts unchecked so a stale toggle can
//   not silently leak Cookie/Authorization headers into later exports.
// - isRecording: always starts recording (same reasoning as devtools.js).
// - selection / active request / detail tab: they reference capture data that
//   never survives a DevTools session anyway.
function applyPersistedSettingsToUi() {
  const settings = NetworkExporterShared.loadPersistedSettings(getSettingsStorage());

  state.preserveLog = settings.preserveLog;
  state.invertFilter = settings.invertFilter;
  state.excludeExtensionRequests = settings.excludeExtensionRequests;
  state.filterText = settings.filterText.trim().toLowerCase();
  state.activeType = settings.activeType;
  state.statusFilter = settings.statusFilter;
  state.isExportCollapsed = settings.isExportCollapsed;

  els.preserveLog.checked = settings.preserveLog;
  els.invertFilter.checked = settings.invertFilter;
  els.excludeExtensionRequests.checked = settings.excludeExtensionRequests;
  els.filterInput.value = settings.filterText;
  els.statusFilter.value = settings.statusFilter;
  els.truncateLargeBodies.checked = settings.truncateLargeBodies;

  for (const chip of els.typeChips.querySelectorAll("[data-type]")) {
    chip.classList.toggle("active", chip.dataset.type === state.activeType);
  }

  const exportFields = new Set(settings.exportFields);
  for (const input of getFieldInputs()) {
    input.checked = exportFields.has(input.dataset.field);
  }

  // Restore order: checked fields in their persisted export order first, then
  // the remaining (unchecked) fields in canonical order. Only the checked
  // fields' relative order survives a restart — unchecked positions are
  // session cosmetics and never affect the export.
  const persistedOrder = new Set(settings.exportFields);
  state.fieldOrder = [
    ...settings.exportFields,
    ...CANONICAL_FIELD_ORDER.filter((field) => !persistedOrder.has(field))
  ];
  syncFieldChipOrder();

  renderExportPane();
}

function collectPanelSettings() {
  return {
    preserveLog: state.preserveLog,
    invertFilter: state.invertFilter,
    excludeExtensionRequests: state.excludeExtensionRequests,
    filterText: els.filterInput.value,
    activeType: state.activeType,
    statusFilter: state.statusFilter,
    isExportCollapsed: state.isExportCollapsed,
    exportFields: getSelectedFields(),
    truncateLargeBodies: els.truncateLargeBodies.checked
  };
}

function savePanelSettings() {
  NetworkExporterShared.persistSettings(getSettingsStorage(), collectPanelSettings());
}

function clearSelection() {
  state.selectedIds.clear();
}

function bindEvents() {
  els.recordToggle.addEventListener("click", () => {
    const nextRecording = !state.isRecording;
    state.isRecording = nextRecording;
    updateCaptureControls();
    if (captureStore) {
      captureStore.setRecording(nextRecording);
    }
    setStatus(state.isRecording ? t("msg_recording_enabled") : t("msg_recording_paused"));
  });

  els.clearRequests.addEventListener("click", () => {
    if (captureStore) {
      captureStore.clear();
    } else {
      state.requests = [];
      state.selectedIds.clear();
      state.activeRequestId = "";
      render();
    }
    setStatus(t("msg_cleared"));
  });

  els.preserveLog.addEventListener("change", () => {
    state.preserveLog = els.preserveLog.checked;
    if (captureStore) {
      // The capture store owns this setting (it must apply from DevTools open,
      // before this panel is selected) and persists it in setPreserveLog().
      captureStore.setPreserveLog(state.preserveLog);
    } else {
      savePanelSettings();
    }
    setStatus(state.preserveLog ? t("msg_preserve_on") : t("msg_preserve_off"));
  });

  els.toggleExportPane.addEventListener("click", () => {
    state.isExportCollapsed = !state.isExportCollapsed;
    renderExportPane();
    savePanelSettings();
  });

  els.filterToggle.addEventListener("click", () => {
    els.filterPanel.classList.toggle("hidden");
    els.filterToggle.classList.toggle("active", !els.filterPanel.classList.contains("hidden"));
  });

  els.filterInput.addEventListener("input", () => {
    state.filterText = els.filterInput.value.trim().toLowerCase();
    clearSelection();
    render();
    savePanelSettings();
  });

  els.invertFilter.addEventListener("change", () => {
    state.invertFilter = els.invertFilter.checked;
    clearSelection();
    render();
    savePanelSettings();
  });

  els.excludeExtensionRequests.addEventListener("change", () => {
    state.excludeExtensionRequests = els.excludeExtensionRequests.checked;
    clearSelection();
    render();
    savePanelSettings();
  });

  els.statusFilter.addEventListener("change", () => {
    state.statusFilter = els.statusFilter.value;
    clearSelection();
    render();
    savePanelSettings();
  });

  els.typeChips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-type]");
    if (!chip) {
      return;
    }

    state.activeType = chip.dataset.type;
    for (const item of els.typeChips.querySelectorAll("[data-type]")) {
      item.classList.toggle("active", item === chip);
    }
    clearSelection();
    render();
    savePanelSettings();
  });

  els.selectAll.addEventListener("change", () => {
    const visible = getVisibleRequests();
    if (els.selectAll.checked) {
      for (const request of visible) {
        state.selectedIds.add(request.id);
      }
    } else {
      for (const request of visible) {
        state.selectedIds.delete(request.id);
      }
    }
    render();
  });

  els.requestRows.addEventListener("change", (event) => {
    const input = event.target.closest("input[type='checkbox'][data-id]");
    if (!input) {
      return;
    }

    if (input.checked) {
      state.selectedIds.add(input.dataset.id);
    } else {
      state.selectedIds.delete(input.dataset.id);
    }
    render();
  });

  els.requestRows.addEventListener("click", (event) => {
    if (event.target.closest("input")) {
      return;
    }

    const row = event.target.closest("tr[data-id]");
    if (!row) {
      return;
    }

    state.activeRequestId = row.dataset.id;
    render();
  });

  els.detailTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-detail-tab]");
    if (!tab) {
      return;
    }

    state.activeDetailTab = tab.dataset.detailTab;
    renderDetail();
  });

  els.selectDefaults.addEventListener("click", () => {
    const defaultFields = new Set(["curlRequest", "statusCode", "responseBody", "method"]);
    for (const input of getFieldInputs()) {
      input.checked = defaultFields.has(input.dataset.field);
    }
    // Defaults resets the full field configuration: the default set *and* the
    // canonical order.
    state.fieldOrder = CANONICAL_FIELD_ORDER.slice();
    syncFieldChipOrder();
    savePanelSettings();
    setStatus(t("msg_defaults_selected"));
  });

  els.selectFullFields.addEventListener("click", () => {
    for (const input of getFieldInputs()) {
      input.checked = true;
    }
    savePanelSettings();
    setStatus(t("msg_full_selected"));
  });

  // Export-field checkboxes and the truncation toggle have no state side
  // effects at click time (they are read during export), but they must be
  // persisted as soon as the user changes them.
  els.fieldList?.addEventListener("change", (event) => {
    if (event.target?.dataset?.field != null) {
      savePanelSettings();
      renderOrderBadges();
    }
  });

  // Move buttons: one click = one step. First field's ← and last field's →
  // are disabled (updateMoveButtonStates) and additionally no-op here, so
  // boundary clicks never write storage.
  els.fieldList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-move]");
    if (!button || button.disabled) {
      return;
    }
    moveFieldBy(button.dataset.fieldName, button.dataset.move === "up" ? -1 : 1);
  });

  els.truncateLargeBodies?.addEventListener("change", () => {
    savePanelSettings();
  });

  els.copyJson.addEventListener("click", () => {
    copyExport("json");
  });

  els.copyMarkdown.addEventListener("click", () => {
    copyExport("markdown");
  });
}

function normalizeRequest(entry) {
  return requestNormalizer.normalizeRequest(entry);
}

function getVisibleRequests() {
  return state.requests.filter((request) => {
    if (state.excludeExtensionRequests && isExtensionRequest(request)) {
      return state.invertFilter;
    }

    const matchesType = state.activeType === "all" || request.typeGroup === state.activeType;
    const matchesStatus = matchesStatusFilter(request);
    const matchesText = matchesFilterText(request);
    const matched = matchesType && matchesStatus && matchesText;
    return state.invertFilter ? !matched : matched;
  });
}

function isExtensionRequest(request) {
  return String(request.url || "").startsWith("chrome-extension://")
    || String(request.url || "").startsWith("moz-extension://")
    || String(request.url || "").startsWith("safari-web-extension://");
}

function isFailedRequest(request) {
  const statusCode = Number(request.statusCode);
  return !Number.isFinite(statusCode) || statusCode < 100;
}

function isClientErrorRequest(request) {
  const statusCode = Number(request.statusCode);
  return Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500;
}

function isServerErrorRequest(request) {
  const statusCode = Number(request.statusCode);
  return Number.isFinite(statusCode) && statusCode >= 500;
}

function isErrorRequest(request) {
  return isClientErrorRequest(request) || isServerErrorRequest(request) || isFailedRequest(request);
}

function matchesStatusFilter(request) {
  if (!state.statusFilter) {
    return true;
  }
  if (state.statusFilter === "failed") {
    return isFailedRequest(request);
  }
  if (state.statusFilter === "errors") {
    return isErrorRequest(request);
  }
  return String(request.statusCode || "").startsWith(state.statusFilter);
}

function matchesFilterText(request) {
  if (!state.filterText) {
    return true;
  }

  const text = state.filterText;
  const exact = parseExactFilter(text);
  if (exact) {
    return matchesExactFilter(request, exact);
  }

  return getSearchText(request).includes(text);
}

function parseExactFilter(text) {
  const match = text.match(/^([a-z-]+):(.*)$/);
  if (!match) {
    return null;
  }
  return {
    key: match[1],
    value: match[2].trim()
  };
}

function matchesExactFilter(request, filter) {
  if (!filter.value) {
    return true;
  }

  const value = filter.value.toLowerCase();
  switch (filter.key) {
    case "url":
      return request.url.toLowerCase().includes(value);
    case "name":
      return request.name.toLowerCase().includes(value);
    case "method":
      return request.method.toLowerCase() === value;
    case "status":
    case "status-code":
      return String(request.statusCode || "").startsWith(value);
    case "domain":
      return getDomain(request.url).toLowerCase().includes(value);
    case "type":
      return request.type.toLowerCase().includes(value) || request.typeGroup.toLowerCase().includes(value);
    case "mime":
    case "mime-type":
      return request.mimeType.toLowerCase().includes(value);
    default:
      return getSearchText(request).includes(`${filter.key}:${filter.value}`.toLowerCase());
  }
}

function getSearchText(request) {
  return [
    request.url,
    request.name,
    request.method,
    request.statusCode,
    request.type,
    request.mimeType,
    getDomain(request.url),
    request.initiator
  ].join(" ").toLowerCase();
}

function render() {
  const visible = getVisibleRequests();
  const selectedVisible = visible.filter((request) => state.selectedIds.has(request.id));
  const activeVisible = visible.some((request) => request.id === state.activeRequestId);
  if (!activeVisible && visible.length && !state.requests.some((request) => request.id === state.activeRequestId)) {
    state.activeRequestId = visible[0].id;
  }

  els.requestRows.innerHTML = "";
  for (const request of visible) {
    els.requestRows.appendChild(renderRow(request));
  }

  els.requestCount.textContent = t("request_count", visible.length, state.requests.length);
  els.selectedCount.textContent = t("selected_count", state.selectedIds.size);
  els.selectAll.checked = visible.length > 0 && selectedVisible.length === visible.length;
  els.selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visible.length;
  renderStatusSummary(visible);
  renderExportPane();
  renderDetail();
}

function renderStatusSummary(requests) {
  if (!els.statusSummary) {
    return;
  }

  const summary = computeStatusSummary(requests);
  els.statusSummary.innerHTML = "";
  els.statusSummary.appendChild(createStatusChip(t("chip_errors"), summary.errors, "strong", t("chip_errors")));
  els.statusSummary.appendChild(createStatusChip("4xx", summary.clientErrors, "client", "4xx"));
  els.statusSummary.appendChild(createStatusChip("5xx", summary.serverErrors, "server", "5xx"));
  els.statusSummary.appendChild(createStatusChip(t("chip_failed"), summary.failed, "failed", t("chip_failed")));
}

function createStatusChip(label, count, variant, title) {
  const chip = document.createElement("span");
  chip.className = `status-chip ${variant}`.trim();
  chip.title = title;

  const dot = document.createElement("span");
  dot.className = "status-dot";
  chip.appendChild(dot);

  const text = document.createElement("span");
  text.textContent = `${label}: ${count}`;
  chip.appendChild(text);

  return chip;
}

function computeStatusSummary(requests) {
  const summary = {
    clientErrors: 0,
    serverErrors: 0,
    failed: 0,
    errors: 0
  };

  for (const request of requests) {
    if (isFailedRequest(request)) {
      summary.failed += 1;
    } else if (isServerErrorRequest(request)) {
      summary.serverErrors += 1;
    } else if (isClientErrorRequest(request)) {
      summary.clientErrors += 1;
    }
  }

  summary.errors = summary.clientErrors + summary.serverErrors + summary.failed;
  return summary;
}

function renderExportPane() {
  els.content.classList.toggle("export-collapsed", state.isExportCollapsed);
  els.exportPane.classList.toggle("collapsed", state.isExportCollapsed);
  els.toggleExportPane.title = state.isExportCollapsed ? t("export_expand") : t("export_collapse");
  els.toggleExportPane.setAttribute("aria-label", els.toggleExportPane.title);
}

function renderRow(request) {
  const tr = document.createElement("tr");
  const statusClass = getStatusClass(request);
  tr.dataset.id = request.id;
  if (statusClass) {
    tr.classList.toggle(statusClass, true);
  }
  tr.classList.toggle("selected", state.selectedIds.has(request.id));
  tr.classList.toggle("active", state.activeRequestId === request.id);

  const checkboxCell = document.createElement("td");
  checkboxCell.className = "select-col";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.id = request.id;
  checkbox.checked = state.selectedIds.has(request.id);
  checkbox.setAttribute("aria-label", `${t("th_name")}: ${request.name}`);
  checkboxCell.appendChild(checkbox);
  tr.appendChild(checkboxCell);

  appendCell(tr, request.name, request.url);
  appendCell(tr, request.method);
  appendCell(tr, request.statusCode || request.statusText || "-", null, `status-cell ${statusClass}`.trim());
  appendCell(tr, request.type || "-");
  appendCell(tr, formatBytes(request.sizeBytes));
  appendCell(tr, formatMs(request.timeMs));
  appendCell(tr, request.initiator || "-");
  appendCell(tr, request.url);

  return tr;
}

function getStatusClass(request) {
  if (isFailedRequest(request)) {
    return "status-failed";
  }
  if (isServerErrorRequest(request)) {
    return "status-server-error";
  }
  if (isClientErrorRequest(request)) {
    return "status-client-error";
  }
  return "";
}

function renderDetail() {
  const request = state.requests.find((item) => item.id === state.activeRequestId);

  for (const tab of els.detailTabs.querySelectorAll("[data-detail-tab]")) {
    tab.classList.toggle("active", tab.dataset.detailTab === state.activeDetailTab);
  }

  if (!request) {
    els.detailName.textContent = t("detail_none");
    els.detailUrl.textContent = "";
    els.detailContent.textContent = t("detail_hint");
    return;
  }

  els.detailName.textContent = `${request.method || "-"} ${request.name || request.url || "(unknown)"}`;
  els.detailUrl.textContent = request.url || "";
  els.detailContent.textContent = getDetailText(request, state.activeDetailTab);
}

function getDetailText(request, tab) {
  switch (tab) {
    case "headers":
      return formatHeadersDetail(request);
    case "payload":
      return formatPayloadDetail(request);
    case "response":
      return formatResponseDetail(request);
    case "meta":
      return formatMetaDetail(request);
    default:
      return "";
  }
}

function formatHeadersDetail(request) {
  return [
    t("detail_general"),
    `${t("detail_url_label")}: ${request.url || "-"}`,
    `${t("detail_method_label")}: ${request.method || "-"}`,
    `${t("detail_status_label")}: ${request.statusCode || request.statusText || "-"}`,
    `${t("detail_type_label")}: ${request.type || "-"}`,
    `${t("detail_mime_label")}: ${request.mimeType || "-"}`,
    "",
    t("detail_request_headers"),
    formatHeaderLines(request.requestHeaders),
    "",
    t("detail_response_headers"),
    formatHeaderLines(request.responseHeaders)
  ].join("\n");
}

function formatPayloadDetail(request) {
  if (!request.requestBody) {
    return t("detail_no_payload");
  }
  return formatMaybeJson(request.requestBody);
}

function formatResponseDetail(request) {
  const responseBody = maybeDecodeResponseBody(request);
  if (!responseBody) {
    return t("detail_no_response");
  }
  return formatMaybeJson(responseBody);
}

function formatMetaDetail(request) {
  return JSON.stringify({
    name: request.name,
    url: request.url,
    method: request.method,
    statusCode: request.statusCode,
    statusText: request.statusText,
    type: request.type,
    typeGroup: request.typeGroup,
    mimeType: request.mimeType,
    size: formatBytes(request.sizeBytes),
    sizeBytes: request.sizeBytes,
    time: formatMs(request.timeMs),
    timeMs: request.timeMs,
    initiator: request.initiator,
    startedDateTime: request.startedDateTime
  }, null, 2);
}

function formatHeaderLines(headers) {
  if (!headers.length) {
    return "-";
  }
  return headers.map((header) => `${header.name}: ${header.value}`).join("\n");
}

function formatMaybeJson(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function appendCell(row, text, title, className = "") {
  const td = document.createElement("td");
  if (className) {
    td.className = className;
  }
  td.textContent = text == null || text === "" ? "-" : String(text);
  td.title = title || td.textContent;
  row.appendChild(td);
}

// Checkbox inputs in the user's current field order. `data-field` lives only
// on the checkboxes (chips and move buttons use data-field-name), so this
// selector never picks up the reorder affordances.
function getFieldInputs() {
  const inputs = Array.from(document.querySelectorAll("[data-field]"));
  const order = state.fieldOrder;
  if (!order.length) {
    return inputs;
  }
  const byField = new Map(inputs.map((input) => [input.dataset.field, input]));
  const seen = new Set();
  const ordered = [];
  for (const field of order) {
    const input = byField.get(field);
    if (input) {
      seen.add(field);
      ordered.push(input);
    }
  }
  for (const input of inputs) {
    if (!seen.has(input.dataset.field)) {
      ordered.push(input);
    }
  }
  return ordered;
}

function getChips() {
  return Array.from(els.fieldList?.querySelectorAll?.(".field-chip") || []);
}

// Reorders the real DOM chips to match state.fieldOrder. appendChild on an
// existing node moves it, so one pass re-sequences the whole list.
function syncFieldChipOrder() {
  const list = els.fieldList;
  if (!list || typeof list.querySelectorAll !== "function") {
    return;
  }
  const byField = new Map(getChips().map((chip) => [chip.dataset.fieldName, chip]));
  if (!byField.size) {
    updateMoveButtonStates();
    renderOrderBadges();
    return;
  }
  for (const field of state.fieldOrder) {
    const chip = byField.get(field);
    if (chip) {
      list.appendChild(chip);
    }
  }
  updateMoveButtonStates();
  renderOrderBadges();
}

function updateMoveButtonStates() {
  const first = state.fieldOrder[0];
  const last = state.fieldOrder[state.fieldOrder.length - 1];
  for (const button of Array.from(els.fieldList?.querySelectorAll?.("[data-move]") || [])) {
    if (button.dataset.move === "up") {
      button.disabled = button.dataset.fieldName === first;
    } else if (button.dataset.move === "down") {
      button.disabled = button.dataset.fieldName === last;
    }
  }
}

// The single reorder primitive for move buttons (±1). Returns false and
// writes nothing when nothing moves.
function moveFieldTo(field, targetIndex) {
  const from = state.fieldOrder.indexOf(field);
  if (from === -1) {
    return false;
  }
  const to = Math.max(0, Math.min(state.fieldOrder.length - 1, targetIndex));
  if (to === from) {
    return false;
  }
  state.fieldOrder.splice(from, 1);
  state.fieldOrder.splice(to, 0, field);
  syncFieldChipOrder();
  savePanelSettings();
  return true;
}

function moveFieldBy(field, delta) {
  const from = state.fieldOrder.indexOf(field);
  return from === -1 ? false : moveFieldTo(field, from + delta);
}

// Ordinal badges: checked fields get 1..n in export order, unchecked get none.
// The numbers — not grid geometry — carry the sequence meaning, so a wrapping
// multi-column layout never obscures which position a field occupies.
function getOrderBadges() {
  const badges = [];
  let ordinal = 0;
  for (const input of getFieldInputs()) {
    if (input.checked) {
      ordinal += 1;
      badges.push({ field: input.dataset.field, ordinal });
    } else {
      badges.push({ field: input.dataset.field, ordinal: 0 });
    }
  }
  return badges;
}

function renderOrderBadges() {
  const chips = new Map(getChips().map((chip) => [chip.dataset.fieldName, chip]));
  for (const { field, ordinal } of getOrderBadges()) {
    const chip = chips.get(field);
    if (!chip) {
      continue;
    }
    const badge = typeof chip.querySelector === "function"
      ? chip.querySelector(".field-order-badge")
      : null;
    if (badge) {
      badge.textContent = ordinal ? String(ordinal) : "";
    }
    chip.classList.toggle("unchecked", !ordinal);
  }
}

function getSelectedFields() {
  return getFieldInputs()
    .filter((input) => input.checked)
    .map((input) => input.dataset.field);
}

function getSelectedRequests() {
  return state.requests.filter((request) => state.selectedIds.has(request.id));
}

// Fallback for environments where the async Clipboard API is disabled by a
// Permissions-Policy on an embedding document — e.g. DevTools running inside
// an IDE webview (VS Code browser preview, remote-debugging containers), where
// our panel is a nested cross-origin iframe that never receives an
// `allow="clipboard-write"` delegation. The legacy synchronous
// document.execCommand("copy") path is not governed by that policy and still
// works inside a user gesture. It is deprecated, but it is a pure fallback:
// if it is ever removed or fails, behavior degrades to exactly today's
// (the copy-failed status), never worse.
function copyViaExecCommand(text) {
  let textarea = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    // readonly keeps mobile browsers from opening the keyboard; fixed
    // off-screen placement avoids scrolling the panel.
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    return Boolean(ok);
  } catch {
    return false;
  } finally {
    if (textarea && textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}

async function copyExport(format) {
  const selected = getSelectedRequests();
  if (!selected.length) {
    setStatus(t("msg_select_request"));
    return;
  }

  const fields = getSelectedFields();
  if (!fields.length) {
    setStatus(t("msg_select_field"));
    return;
  }

  let rows;
  let text;
  try {
    rows = selected.map((request) => buildExportObject(request, fields));
    text = format === "markdown" ? toMarkdown(rows, fields) : JSON.stringify(rows, null, 2);
  } catch (error) {
    setStatus(t("msg_build_failed", error.message));
    return;
  }

  const byteLength = NetworkExporterShared.getByteLength(text);
  const tokenCount = NetworkExporterShared.estimateTokens(text);

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    // Blocked by a Permissions-Policy (or the document lost focus). Retry via
    // the legacy synchronous path before giving up.
    if (!copyViaExecCommand(text)) {
      setStatus(t("msg_copy_failed", error.message));
      return;
    }
  }
  renderCopyResult(selected.length, format, byteLength, tokenCount);
}

function renderCopyResult(selectedCount, format, byteLength, tokenCount) {
  const host = els.statusMessage;
  host.textContent = "";

  const requestWord = selectedCount === 1 ? t("msg_request_one") : t("msg_request_many");

  host.appendChild(document.createTextNode(`${t("msg_copied")} `));
  host.appendChild(createMetricChip(`${selectedCount} ${requestWord}`));
  host.appendChild(document.createTextNode(` ${t("msg_as")} ${format} · `));
  host.appendChild(createMetricChip(formatBytes(byteLength)));
  host.appendChild(document.createTextNode(" · "));
  host.appendChild(createMetricChip(`~${tokenCount.toLocaleString()} tokens`, getTokenTier(tokenCount)));
}

function createMetricChip(label, variant) {
  const chip = document.createElement("span");
  chip.className = variant ? `metric-chip ${variant}` : "metric-chip";
  chip.textContent = label;
  return chip;
}

function getTokenTier(tokenCount) {
  if (tokenCount < 1000) return "tier-good";
  if (tokenCount < 8000) return "tier-warn";
  if (tokenCount < 16000) return "tier-hot";
  return "tier-bad";
}

function buildExportObject(request, fields, options = {}) {
  const output = {};
  const includeSensitive = options.includeSensitive ?? els.includeSensitiveHeaders.checked;
  const truncateBodies = options.truncateBodies ?? (els.truncateLargeBodies ? els.truncateLargeBodies.checked : true);

  function maybeTruncate(value) {
    return truncateBodies ? truncateBody(value, MAX_EXPORT_BODY_BYTES) : value;
  }

  for (const field of fields) {
    switch (field) {
      case "curlRequest":
        output.curlRequest = buildCurl(request, includeSensitive, truncateBodies);
        break;
      case "statusCode":
        output.statusCode = request.statusCode;
        break;
      case "responseBody":
        output.responseBody = maybeTruncate(maybeDecodeResponseBody(request));
        break;
      case "requestHeaders":
        output.requestHeaders = headersToObject(filterHeaders(request.requestHeaders, includeSensitive));
        break;
      case "responseHeaders":
        output.responseHeaders = headersToObject(filterHeaders(request.responseHeaders, includeSensitive));
        break;
      case "requestBody":
        output.requestBody = maybeTruncate(request.requestBody || "");
        break;
      case "size":
        output.size = formatBytes(request.sizeBytes);
        output.sizeBytes = request.sizeBytes;
        break;
      case "time":
        output.time = formatMs(request.timeMs);
        output.timeMs = request.timeMs;
        break;
      default:
        output[field] = request[field] ?? "";
    }
  }

  return output;
}

function buildCurl(request, includeSensitive, truncateBodies) {
  const parts = ["curl"];
  parts.push(shellQuote(request.url));

  if (request.method && request.method.toUpperCase() !== "GET") {
    parts.push("-X", shellQuote(request.method.toUpperCase()));
  }

  for (const header of filterHeaders(request.requestHeaders, includeSensitive)) {
    if (!header.name) {
      continue;
    }
    parts.push("-H", shellQuote(`${header.name}: ${header.value}`));
  }

  if (request.requestBody) {
    const body = truncateBodies ? truncateBody(request.requestBody, MAX_EXPORT_BODY_BYTES) : request.requestBody;
    parts.push("--data-raw", shellQuote(body));
  }

  return parts.join(" ");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function filterHeaders(headers, includeSensitive) {
  if (includeSensitive) {
    return headers;
  }
  return headers.filter((header) => !SENSITIVE_HEADER_NAMES.has(header.name.toLowerCase()));
}

function headersToObject(headers) {
  return headers.reduce((output, header) => {
    if (!header.name) {
      return output;
    }
    if (output[header.name] == null) {
      output[header.name] = header.value;
    } else if (Array.isArray(output[header.name])) {
      output[header.name].push(header.value);
    } else {
      output[header.name] = [output[header.name], header.value];
    }
    return output;
  }, {});
}

function maybeDecodeResponseBody(request) {
  if (!request.responseBody) {
    return "";
  }

  if (isLikelyBinaryMimeType(request.mimeType)) {
    const bytes = NetworkExporterShared.getByteLength(request.responseBody);
    return `[binary response: ${request.mimeType || "unknown"}, ${bytes.toLocaleString()} bytes]`;
  }

  if (request.responseEncoding !== "base64") {
    return request.responseBody;
  }

  try {
    const binary = atob(request.responseBody);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "[response body could not be decoded]";
  }
}

function toMarkdown(rows, fields) {
  return rows.map((row, index) => {
    const lines = [`## Request ${index + 1}`];
    for (const field of fields) {
      const value = row[field];
      lines.push(`### ${field}`);
      if (typeof value === "object" && value !== null) {
        const jsonValue = JSON.stringify(value, null, 2);
        const fence = getCodeFence(jsonValue);
        lines.push(`${fence}json`);
        lines.push(jsonValue);
        lines.push(fence);
      } else if (field.toLowerCase().includes("body") || field === "curlRequest") {
        const textValue = value == null ? "" : String(value);
        const fence = getCodeFence(textValue);
        lines.push(fence);
        lines.push(textValue);
        lines.push(fence);
      } else {
        lines.push(value == null || value === "" ? "-" : String(value));
      }
    }
    return lines.join("\n");
  }).join("\n\n");
}

function getCodeFence(value) {
  const runs = String(value).match(/`{3,}/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 2);
  return "`".repeat(longest + 1);
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) {
    return "-";
  }
  return `${Math.round(ms)} ms`;
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

globalThis.attachNetworkExporterStore = attachNetworkExporterStore;

globalThis.NetworkExporterInternals = {
  state,
  clearSelection,
  attachNetworkExporterStore,
  applyCaptureSnapshot,
  applyPersistedSettingsToUi,
  collectPanelSettings,
  savePanelSettings,
  copyViaExecCommand,
  getFieldInputs,
  moveFieldTo,
  moveFieldBy,
  syncFieldChipOrder,
  getOrderBadges,
  renderOrderBadges,
  normalizeRequest,
  getTypeGroup,
  getVisibleRequests,
  getByteLength: NetworkExporterShared.getByteLength,
  estimateTokens: NetworkExporterShared.estimateTokens,
  getTokenTier,
  createMetricChip,
  isExtensionRequest,
  isFailedRequest,
  isClientErrorRequest,
  isServerErrorRequest,
  isErrorRequest,
  getStatusClass,
  computeStatusSummary,
  renderStatusSummary,
  renderExportPane,
  getDetailText,
  formatHeadersDetail,
  formatPayloadDetail,
  formatResponseDetail,
  formatMetaDetail,
  formatMaybeJson,
  matchesStatusFilter,
  matchesFilterText,
  parseExactFilter,
  matchesExactFilter,
  buildExportObject,
  buildCurl,
  filterHeaders,
  headersToObject,
  maybeDecodeResponseBody,
  truncateBody,
  clampStoredBody,
  isLikelyBinaryMimeType,
  toMarkdown,
  getCodeFence,
  formatBytes,
  formatMs,
  getDomain
};
