"use strict";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
  "xsrf-token"
]);

const state = {
  requests: [],
  selectedIds: new Set(),
  isRecording: true,
  isExportCollapsed: false,
  activeType: "all",
  activeRequestId: "",
  activeDetailTab: "headers",
  filterText: "",
  invertFilter: false,
  excludeExtensionRequests: true,
  statusFilter: ""
};

let nextRequestSequence = 0;

const els = {
  content: document.getElementById("content"),
  recordToggle: document.getElementById("recordToggle"),
  clearRequests: document.getElementById("clearRequests"),
  filterToggle: document.getElementById("filterToggle"),
  filterPanel: document.getElementById("filterPanel"),
  filterInput: document.getElementById("filterInput"),
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

  if (!hasDevToolsNetworkApi()) {
    render();
    setStatus("Open this panel inside Chrome DevTools to capture requests.");
    return;
  }

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    if (!state.isRecording) {
      return;
    }

    const normalized = normalizeRequest(request);
    upsertRequest(normalized);

    request.getContent((content, encoding) => {
      const target = state.requests.find((item) => item.id === normalized.id);
      if (!target) {
        return;
      }

      target.responseBody = content || "";
      target.responseEncoding = encoding || "";
      render();
    });
  });

  hydrateFromHar();
}

function hasDevToolsNetworkApi() {
  return Boolean(globalThis.chrome?.devtools?.network);
}

function bindEvents() {
  els.recordToggle.addEventListener("click", () => {
    state.isRecording = !state.isRecording;
    els.recordToggle.classList.toggle("active", state.isRecording);
    setStatus(state.isRecording ? "Recording enabled." : "Recording paused.");
  });

  els.clearRequests.addEventListener("click", () => {
    state.requests = [];
    state.selectedIds.clear();
    state.activeRequestId = "";
    render();
    setStatus("Captured requests cleared.");
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
    const defaultFields = new Set(["curlRequest", "statusCode", "responseBody", "url", "method"]);
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

function hydrateFromHar() {
  chrome.devtools.network.getHAR((harLog) => {
    const entries = harLog?.entries || [];
    for (const entry of entries) {
      upsertRequest(normalizeRequest(entry));
    }
    render();
  });
}

function normalizeRequest(entry) {
  const request = entry.request || {};
  const response = entry.response || {};
  const timings = entry.timings || {};
  const url = request.url || "";
  const method = request.method || "";
  const status = Number.isFinite(response.status) ? response.status : null;
  const time = typeof entry.time === "number" ? entry.time : sumTimings(timings);
  const startedDateTime = entry.startedDateTime || "";
  const resourceType = getResourceType(entry);

  return {
    id: makeRequestId(entry),
    name: getName(url),
    url,
    method,
    statusCode: status,
    statusText: response.statusText || "",
    type: resourceType,
    typeGroup: getTypeGroup(resourceType, response.content?.mimeType || ""),
    mimeType: response.content?.mimeType || "",
    sizeBytes: getSizeBytes(entry),
    timeMs: Number.isFinite(time) ? time : null,
    initiator: getInitiator(entry),
    startedDateTime,
    requestHeaders: normalizeHeaders(request.headers || []),
    responseHeaders: normalizeHeaders(response.headers || []),
    requestBody: request.postData?.text || "",
    responseBody: response.content?.text || "",
    responseEncoding: response.content?.encoding || "",
    raw: entry
  };
}

function makeRequestId(entry) {
  if (entry._requestId) {
    return `chrome:${entry._requestId}`;
  }

  const request = entry.request || {};
  const response = entry.response || {};
  const started = entry.startedDateTime || "";
  const signature = [
    started,
    request.method || "",
    request.url || "",
    response.status || "",
    entry.time || ""
  ].join("|");
  nextRequestSequence += 1;
  return `fallback:${nextRequestSequence}:${signature}`;
}

function getName(url) {
  if (!url) {
    return "(unknown)";
  }

  try {
    const parsed = new URL(url);
    const lastPath = parsed.pathname.split("/").filter(Boolean).pop();
    return lastPath ? `${lastPath}${parsed.search}` : parsed.hostname;
  } catch {
    return url;
  }
}

function getResourceType(entry) {
  const rawType = entry._resourceType || entry.type || entry.resourceType || "";
  if (rawType) {
    return String(rawType).toLowerCase();
  }

  const mimeType = entry.response?.content?.mimeType || "";
  return guessTypeFromMime(mimeType);
}

function guessTypeFromMime(mimeType) {
  const mime = mimeType.toLowerCase();
  if (mime.includes("html")) return "document";
  if (mime.includes("css")) return "stylesheet";
  if (mime.includes("javascript") || mime.includes("ecmascript")) return "script";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("font/")) return "font";
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return "media";
  if (mime.includes("manifest")) return "manifest";
  if (mime.includes("wasm")) return "wasm";
  if (mime.includes("json") || mime.includes("xml")) return "fetch";
  return "other";
}

function getTypeGroup(type, mimeType) {
  const normalized = String(type || "").toLowerCase();
  if (["xhr", "fetch"].includes(normalized)) return "fetch-xhr";
  if (["document", "doc"].includes(normalized)) return "doc";
  if (["stylesheet", "css"].includes(normalized)) return "css";
  if (["script", "js"].includes(normalized)) return "js";
  if (["font"].includes(normalized)) return "font";
  if (["image", "img"].includes(normalized)) return "img";
  if (["media", "audio", "video"].includes(normalized)) return "media";
  if (["manifest"].includes(normalized)) return "manifest";
  if (["websocket", "socket", "webtransport"].includes(normalized)) return "socket";
  if (["wasm"].includes(normalized)) return "wasm";

  const guessed = guessTypeFromMime(mimeType);
  if (guessed === "document") return "doc";
  if (guessed === "stylesheet") return "css";
  if (guessed === "script") return "js";
  if (guessed === "image") return "img";
  if (guessed === "fetch") return "fetch-xhr";
  if (["font", "media", "manifest", "wasm"].includes(guessed)) return guessed;
  return "other";
}

function getSizeBytes(entry) {
  const response = entry.response || {};
  const bodySize = Number(response.bodySize);
  const headersSize = Number(response.headersSize);
  const contentSize = Number(response.content?.size);

  if (Number.isFinite(bodySize) && bodySize >= 0) {
    return bodySize + (Number.isFinite(headersSize) && headersSize > 0 ? headersSize : 0);
  }
  if (Number.isFinite(contentSize) && contentSize >= 0) {
    return contentSize;
  }
  return null;
}

function getInitiator(entry) {
  const initiator = entry._initiator || entry.initiator;
  if (!initiator) {
    return "";
  }
  if (typeof initiator === "string") {
    return initiator;
  }
  if (initiator.url) {
    const line = initiator.lineNumber != null ? `:${initiator.lineNumber}` : "";
    return `${getName(initiator.url)}${line}`;
  }
  if (initiator.stack?.callFrames?.length) {
    const frame = initiator.stack.callFrames[0];
    const line = frame.lineNumber != null ? `:${frame.lineNumber}` : "";
    return `${getName(frame.url || frame.functionName || "script")}${line}`;
  }
  return initiator.type || "";
}

function normalizeHeaders(headers) {
  return headers.map((header) => ({
    name: header.name || "",
    value: header.value || ""
  }));
}

function sumTimings(timings) {
  const values = Object.values(timings || {}).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function upsertRequest(request) {
  const index = state.requests.findIndex((item) => item.id === request.id);
  if (index === -1) {
    state.requests.push(request);
    if (!state.activeRequestId) {
      state.activeRequestId = request.id;
    }
  } else {
    state.requests[index] = {
      ...state.requests[index],
      ...request,
      responseBody: request.responseBody || state.requests[index].responseBody,
      responseEncoding: request.responseEncoding || state.requests[index].responseEncoding
    };
  }
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

  try {
    await navigator.clipboard.writeText(text);
    setStatus(`Copied ${selected.length} request${selected.length === 1 ? "" : "s"} as ${format}.`);
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`);
  }
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

globalThis.NetworkExporterInternals = {
  state,
  normalizeRequest,
  getTypeGroup,
  getVisibleRequests,
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
