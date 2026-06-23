"use strict";

(function exposeNetworkExporterShared(global) {
  const SENSITIVE_HEADER_NAMES = new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "xsrf-token"
  ]);

  function createRequestNormalizer() {
    let nextRequestSequence = 0;

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
        responseEncoding: response.content?.encoding || ""
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

    return {
      normalizeRequest
    };
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

  global.NetworkExporterShared = {
    SENSITIVE_HEADER_NAMES,
    createRequestNormalizer,
    getName,
    getTypeGroup,
    isFailedRequest,
    isClientErrorRequest,
    isServerErrorRequest,
    isErrorRequest
  };
})(globalThis);
