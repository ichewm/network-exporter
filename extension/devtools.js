"use strict";

const clampStoredBody = NetworkExporterShared.clampStoredBody;

const captureStore = createNetworkExporterCaptureStore();
globalThis.NetworkExporterCaptureStore = captureStore;

chrome.devtools.panels.create(
  "Network Exporter",
  "icons/icon-16.png",
  "panel.html",
  (panel) => {
    panel.onShown.addListener((panelWindow) => {
      attachPanelWindow(panelWindow);
    });
  }
);

function attachPanelWindow(panelWindow) {
  if (typeof panelWindow.attachNetworkExporterStore === "function") {
    panelWindow.attachNetworkExporterStore(captureStore);
    return;
  }

  panelWindow.NetworkExporterPendingStore = captureStore;
}

function getSettingsStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function createNetworkExporterCaptureStore() {
  const normalizer = NetworkExporterShared.createRequestNormalizer();
  const subscribers = new Set();
  const settingsStorage = getSettingsStorage();
  const state = {
    requests: [],
    // Intentionally NOT persisted: a paused recorder must never silently
    // survive into the next DevTools session. Mirrors DevTools, where the
    // Network record toggle is session-scoped and always restarts recording.
    isRecording: true,
    preserveLog: NetworkExporterShared.loadPersistedSettings(settingsStorage).preserveLog
  };

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    if (!state.isRecording) {
      return;
    }

    let normalized;
    try {
      normalized = normalizer.normalizeRequest(request);
    } catch (error) {
      normalized = makeErrorRequest(request, error);
    }
    upsertRequest(normalized);
    notify();

    if (typeof request.getContent !== "function") {
      return;
    }

    try {
      request.getContent((content, encoding) => {
        try {
          const target = state.requests.find((item) => item.id === normalized.id);
          if (!target) {
            return;
          }

          target.responseBody = clampStoredBody(content || "");
          target.responseEncoding = encoding || "";
          notify();
        } catch (error) {
          console.error("[network-exporter] getContent callback failed:", error);
        }
      });
    } catch (error) {
      console.error("[network-exporter] getContent invocation failed:", error);
    }
  });

  chrome.devtools.network.onNavigated.addListener(() => {
    if (!state.preserveLog) {
      clear();
    }
  });

  // Cross-window sync: another DevTools window of the same extension origin
  // wrote the shared settings while this DevTools instance is open. Keep the
  // live store (and its panel) in sync instead of picking the change up only
  // on the next DevTools launch.
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("storage", (event) => {
      if (!event || event.key !== NetworkExporterShared.PERSISTED_SETTINGS_KEY) {
        return;
      }
      const persisted = NetworkExporterShared.loadPersistedSettings(settingsStorage);
      if (persisted.preserveLog !== state.preserveLog) {
        state.preserveLog = persisted.preserveLog;
        notify();
      }
    });
  }

  hydrateFromHar();

  return {
    clear,
    getSnapshot,
    setPreserveLog,
    setRecording,
    subscribe
  };

  function hydrateFromHar() {
    chrome.devtools.network.getHAR((harLog) => {
      const entries = harLog?.entries || [];
      for (const entry of entries) {
        let normalized;
        try {
          normalized = normalizer.normalizeRequest(entry);
        } catch (error) {
          normalized = makeErrorRequest(entry, error);
        }
        upsertRequest(normalized);
      }
      notify();
    });
  }

  function upsertRequest(request) {
    const index = state.requests.findIndex((item) => item.id === request.id);
    if (index === -1) {
      state.requests.push(request);
      return;
    }

    state.requests[index] = {
      ...state.requests[index],
      ...request,
      responseBody: request.responseBody || state.requests[index].responseBody,
      responseEncoding: request.responseEncoding || state.requests[index].responseEncoding
    };
  }

  function clear() {
    state.requests = [];
    notify();
  }

  function setRecording(value) {
    state.isRecording = Boolean(value);
    notify();
  }

  function setPreserveLog(value) {
    state.preserveLog = Boolean(value);
    NetworkExporterShared.persistSettings(settingsStorage, { preserveLog: state.preserveLog });
    notify();
  }

  function subscribe(listener) {
    subscribers.add(listener);
    listener(getSnapshot());

    return () => {
      subscribers.delete(listener);
    };
  }

  function notify() {
    const snapshot = getSnapshot();
    for (const listener of subscribers) {
      listener(snapshot);
    }
  }

  function getSnapshot() {
    return {
      requests: state.requests.map(cloneRequest),
      isRecording: state.isRecording,
      preserveLog: state.preserveLog
    };
  }

  function cloneRequest(request) {
    return {
      ...request,
      requestHeaders: request.requestHeaders.map((header) => ({ ...header })),
      responseHeaders: request.responseHeaders.map((header) => ({ ...header }))
    };
  }

  function makeErrorRequest(entry, error) {
    let rawUrl = "";
    let rawMethod = "";
    try {
      rawUrl = entry?.request?.url || "";
      rawMethod = entry?.request?.method || "";
    } catch {
      rawUrl = "";
      rawMethod = "";
    }
    const sequence = `error:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    return {
      id: sequence,
      name: NetworkExporterShared.getName(rawUrl) || "(capture failed)",
      url: rawUrl,
      method: rawMethod,
      statusCode: null,
      statusText: "",
      type: "other",
      typeGroup: "other",
      mimeType: "",
      sizeBytes: null,
      timeMs: null,
      initiator: "",
      startedDateTime: "",
      requestHeaders: [],
      responseHeaders: [],
      requestBody: "",
      responseBody: `[network exporter] failed to capture this request: ${error?.message || error}`,
      responseEncoding: ""
    };
  }
}
