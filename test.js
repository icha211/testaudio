const APP_CONFIG = window.APP_CONFIG || {};
const RTDB_BASE = APP_CONFIG.rtdbBaseUrl || "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";
const DRAFTS_PATH = "/toefl_itp/drafts_v2";
const DATE_INDEX_PATH = "/toefl_itp/index_by_date/listening";

const refs = {
  setDate: document.getElementById("setDate"),
  setId: document.getElementById("setId"),
  streamStatus: document.getElementById("streamStatus"),
  testTitle: document.getElementById("testTitle"),
  testMeta: document.getElementById("testMeta"),
  partsView: document.getElementById("partsView")
};

let eventSource = null;
let currentData = null;

function setStatus(message, kind = "ok") {
  refs.streamStatus.textContent = message;
  refs.streamStatus.className = `status ${kind}`;
}

function apiUrl(path, useStream = false) {
  const base = `${RTDB_BASE}${path}.json`;
  return useStream ? `${base}?ns=quickcheck-25590-default-rtdb` : base;
}

async function rtdbGet(path) {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`GET failed (${response.status})`);
  }
  return response.json();
}

function renderPart(partKey, part) {
  const audioUrl = part.audio_cloudflare || part.audio_firebase || "";

  return `
    <article class="viewer-part">
      <h3>Part ${partKey}</h3>
      ${audioUrl ? `<audio class="audio" controls src="${audioUrl}"></audio>` : "<p class=\"muted\">No audio URL.</p>"}

      <div class="viewer-section">
        <h4>Questions</h4>
        <pre>${escapeHtml(part.questions || "")}</pre>
      </div>

      <div class="viewer-section">
        <h4>Transcripts</h4>
        <pre>${escapeHtml(part.transcripts || "")}</pre>
      </div>

      <div class="viewer-section">
        <h4>Answer Key</h4>
        <pre>${escapeHtml(part.answerKey || "")}</pre>
      </div>

      <div class="viewer-section">
        <h4>Explanation</h4>
        <pre>${escapeHtml(part.explanation || "")}</pre>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDraft(data) {
  currentData = data;

  if (!data) {
    refs.testTitle.textContent = "No test loaded";
    refs.testMeta.textContent = "No data at this path.";
    refs.partsView.innerHTML = "";
    return;
  }

  const setId = data.setId || data.id || refs.setId.value;
  const setDate = data.setDate || "unknown date";

  refs.testTitle.textContent = `Set: ${setId}`;
  refs.testMeta.textContent = `Date: ${setDate} | Difficulty: ${data.difficulty || "-"} | Updated: ${data.updatedAt || data._updatedAt || "-"}`;

  const parts = data.parts || {};
  const keys = Object.keys(parts).sort((a, b) => Number(a) - Number(b));

  if (!keys.length) {
    refs.partsView.innerHTML = "<p class=\"muted\">No parts available yet.</p>";
    return;
  }

  refs.partsView.innerHTML = keys.map((key) => renderPart(key, parts[key] || {})).join("");
}

function setNestedValue(obj, path, value) {
  if (path === "/") {
    return value;
  }

  const segments = path.split("/").filter(Boolean);
  const clone = structuredClone(obj || {});
  let cursor = clone;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (typeof cursor[segment] !== "object" || cursor[segment] === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  cursor[segments[segments.length - 1]] = value;
  return clone;
}

function handleStreamEvent(event) {
  try {
    const payload = JSON.parse(event.data);
    const { path, data } = payload;

    if (path === "/") {
      renderDraft(data);
      return;
    }

    const merged = setNestedValue(currentData || {}, path, data);
    renderDraft(merged);
  } catch (error) {
    setStatus(`Stream parse error: ${error.message}`, "warn");
  }
}

function closeStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function openStream(setId) {
  closeStream();
  const path = `${DRAFTS_PATH}/${setId}`;
  eventSource = new EventSource(apiUrl(path, true));

  eventSource.addEventListener("open", () => {
    setStatus(`Connected to ${setId}. Waiting for updates...`, "ok");
  });

  eventSource.addEventListener("put", handleStreamEvent);
  eventSource.addEventListener("patch", handleStreamEvent);

  eventSource.addEventListener("error", () => {
    setStatus("Stream disconnected. Auto-retrying...", "warn");
  });
}

async function resolveSetId() {
  const fromInput = refs.setId.value.trim();
  if (fromInput) {
    return fromInput;
  }

  const date = refs.setDate.value;
  if (!date) {
    return "";
  }

  const indexed = await rtdbGet(`${DATE_INDEX_PATH}/${date}`);
  return typeof indexed === "string" ? indexed : "";
}

async function connect() {
  try {
    setStatus("Resolving set and connecting...", "ok");
    const setId = await resolveSetId();

    if (!setId) {
      setStatus("Set ID not found. Enter set ID or date first.", "warn");
      return;
    }

    refs.setId.value = setId;
    localStorage.setItem("toefl_listening_last_set_id", setId);

    const initial = await rtdbGet(`${DRAFTS_PATH}/${setId}`);
    renderDraft(initial);
    openStream(setId);
  } catch (error) {
    setStatus(`Connect failed: ${error.message}`, "warn");
  }
}

function initFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const qSetId = params.get("setId") || "";
  const qSetDate = params.get("setDate") || "";
  const lastSetId = localStorage.getItem("toefl_listening_last_set_id") || "";

  refs.setId.value = qSetId || lastSetId;
  refs.setDate.value = qSetDate;
}

document.getElementById("btnConnect").addEventListener("click", connect);
window.addEventListener("beforeunload", closeStream);

initFromQuery();
if (refs.setId.value || refs.setDate.value) {
  connect();
}
