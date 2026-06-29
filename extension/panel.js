"use strict";

const SENSITIVE_HEADER_NAMES = NetworkExporterShared.SENSITIVE_HEADER_NAMES;
const requestNormalizer = NetworkExporterShared.createRequestNormalizer();
const getTypeGroup = NetworkExporterShared.getTypeGroup;

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
  statusFilter: ""
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
  statusMessage: document.getElementById("statusMessage")
};

init();

function init() {
  bindEvents();

  if (globalThis.NetworkExporterPendingStore) {
    attachNetworkExporterStore(globalThis.NetworkExporterPendingStore);
    return;
  }

  render();
  updateCaptureControls();
  setStatus(hasDevToolsApi() ? "Waiting for DevTools capture bridge." : "Open this panel inside Chrome DevTools to capture requests.");
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
  els.recordToggle.title = state.isRecording ? "Pause request recording" : "Record requests";
  els.recordToggle.setAttribute("aria-label", els.recordToggle.title);
  els.preserveLog.checked = state.preserveLog;
}

function bindEvents() {
  els.recordToggle.addEventListener("click", () => {
    const nextRecording = !state.isRecording;
    state.isRecording = nextRecording;
    updateCaptureControls();
    if (captureStore) {
      captureStore.setRecording(nextRecording);
    }
    setStatus(state.isRecording ? "Recording enabled." : "Recording paused.");
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
    setStatus("Captured requests cleared.");
  });

  els.preserveLog.addEventListener("change", () => {
    state.preserveLog = els.preserveLog.checked;
    if (captureStore) {
      captureStore.setPreserveLog(state.preserveLog);
    }
    setStatus(state.preserveLog ? "Preserve log enabled." : "Preserve log disabled. New navigations clear captured requests.");
  });

  els.toggleExportPane.addEventListener("click", () => {
    state.isExportCollapsed = !state.isExportCollapsed;
    renderExportPane();
  });

  els.filterToggle.addEventListener("click", () => {
    els.filterPanel.classList.toggle("hidden");
    els.filterToggle.classList.toggle("active", !els.filterPanel.classList.contains("hidden"));
  });

  els.filterInput.addEventListener("input", () => {
    state.filterText = els.filterInput.value.trim().toLowerCase();
    render();
  });

  els.invertFilter.addEventListener("change", () => {
    state.invertFilter = els.invertFilter.checked;
    render();
  });

  els.excludeExtensionRequests.addEventListener("change", () => {
    state.excludeExtensionRequests = els.excludeExtensionRequests.checked;
    render();
  });

  els.statusFilter.addEventListener("change", () => {
    state.statusFilter = els.statusFilter.value;
    render();
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
    render();
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
    setStatus("Default export fields selected.");
  });

  els.selectFullFields.addEventListener("click", () => {
    for (const input of getFieldInputs()) {
      input.checked = true;
    }
    setStatus("Full export fields selected.");
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

  els.requestCount.textContent = `${visible.length} of ${state.requests.length} requests`;
  els.selectedCount.textContent = `${state.selectedIds.size} selected`;
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
  els.statusSummary.appendChild(createStatusChip("Errors", summary.errors, "strong", "4xx, 5xx, and failed requests"));
  els.statusSummary.appendChild(createStatusChip("4xx", summary.clientErrors, "client", "Client error responses"));
  els.statusSummary.appendChild(createStatusChip("5xx", summary.serverErrors, "server", "Server error responses"));
  els.statusSummary.appendChild(createStatusChip("Failed", summary.failed, "failed", "Requests without a normal HTTP response"));
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
  els.toggleExportPane.title = state.isExportCollapsed ? "Expand export panel" : "Collapse export panel";
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
  checkbox.setAttribute("aria-label", `Select ${request.name}`);
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
    els.detailName.textContent = "No request selected";
    els.detailUrl.textContent = "";
    els.detailContent.textContent = "Click a request row to inspect it.";
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
    "General",
    `URL: ${request.url || "-"}`,
    `Method: ${request.method || "-"}`,
    `Status: ${request.statusCode || request.statusText || "-"}`,
    `Type: ${request.type || "-"}`,
    `MIME type: ${request.mimeType || "-"}`,
    "",
    "Request Headers",
    formatHeaderLines(request.requestHeaders),
    "",
    "Response Headers",
    formatHeaderLines(request.responseHeaders)
  ].join("\n");
}

function formatPayloadDetail(request) {
  if (!request.requestBody) {
    return "No request payload.";
  }
  return formatMaybeJson(request.requestBody);
}

function formatResponseDetail(request) {
  const responseBody = maybeDecodeResponseBody(request);
  if (!responseBody) {
    return "No response body captured.";
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

function getFieldInputs() {
  return Array.from(document.querySelectorAll("[data-field]"));
}

function getSelectedFields() {
  return getFieldInputs()
    .filter((input) => input.checked)
    .map((input) => input.dataset.field);
}

function getSelectedRequests() {
  return state.requests.filter((request) => state.selectedIds.has(request.id));
}

async function copyExport(format) {
  const selected = getSelectedRequests();
  if (!selected.length) {
    setStatus("Select at least one request before exporting.");
    return;
  }

  const fields = getSelectedFields();
  if (!fields.length) {
    setStatus("Select at least one export field.");
    return;
  }

  const rows = selected.map((request) => buildExportObject(request, fields));
  const text = format === "markdown" ? toMarkdown(rows, fields) : JSON.stringify(rows, null, 2);

  const byteLength = NetworkExporterShared.getByteLength(text);
  const tokenCount = NetworkExporterShared.estimateTokens(text);

  try {
    await navigator.clipboard.writeText(text);
    renderCopyResult(selected.length, format, byteLength, tokenCount);
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`);
  }
}

function renderCopyResult(selectedCount, format, byteLength, tokenCount) {
  const host = els.statusMessage;
  host.textContent = "";

  host.appendChild(document.createTextNode("Copied "));
  host.appendChild(createMetricChip(`${selectedCount} request${selectedCount === 1 ? "" : "s"}`));
  host.appendChild(document.createTextNode(` as ${format} · `));
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

  for (const field of fields) {
    switch (field) {
      case "curlRequest":
        output.curlRequest = buildCurl(request, includeSensitive);
        break;
      case "statusCode":
        output.statusCode = request.statusCode;
        break;
      case "responseBody":
        output.responseBody = maybeDecodeResponseBody(request);
        break;
      case "requestHeaders":
        output.requestHeaders = headersToObject(filterHeaders(request.requestHeaders, includeSensitive));
        break;
      case "responseHeaders":
        output.responseHeaders = headersToObject(filterHeaders(request.responseHeaders, includeSensitive));
        break;
      case "requestBody":
        output.requestBody = request.requestBody || "";
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

function buildCurl(request, includeSensitive) {
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
    parts.push("--data-raw", shellQuote(request.requestBody));
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
  if (request.responseEncoding !== "base64") {
    return request.responseBody;
  }
  try {
    const binary = atob(request.responseBody);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return request.responseBody;
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
  attachNetworkExporterStore,
  applyCaptureSnapshot,
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
  toMarkdown,
  getCodeFence,
  formatBytes,
  formatMs,
  getDomain
};
