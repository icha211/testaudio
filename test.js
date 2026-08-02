const APP_CONFIG = window.APP_CONFIG || {};
const RTDB_BASE = APP_CONFIG.rtdbBaseUrl || "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";
const API_GATEWAY_BASE = (APP_CONFIG.apiGatewayBase || "").trim().replace(/\/+$/, "");
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

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function expectedPartSuffix(partKey) {
  return `/part_${partKey}.mp3`;
}

function isPlayablePartKey(partKey) {
  return /^[123]$/.test(String(partKey || ""));
}

function buildFolderDerivedPartUrl(folderUrl, partKey) {
  const cleanFolder = normalizeUrl(folderUrl);
  if (!cleanFolder) {
    return "";
  }
  return `${cleanFolder}${expectedPartSuffix(partKey)}`;
}

function buildProxyAudioUrl(objectKey) {
  if (!API_GATEWAY_BASE || !objectKey) {
    return "";
  }

  return `${API_GATEWAY_BASE}/api/developer/audio-proxy?objectKey=${encodeURIComponent(objectKey)}`;
}

function resolveDirectPartAudioUrl(partKey, part, draft) {
  if (!isPlayablePartKey(partKey)) {
    return "";
  }

  const expectedSuffix = expectedPartSuffix(partKey);
  const cloudflareUrl = String(part.audio_cloudflare || "").trim();
  const firebaseUrl = String(part.audio_firebase || "").trim();
  const folderUrl = String(draft.cloudflare_folder || "").trim();
  if (cloudflareUrl && cloudflareUrl.includes(expectedSuffix)) {
    return cloudflareUrl;
  }

  if (folderUrl) {
    const folderDerived = buildFolderDerivedPartUrl(folderUrl, partKey);
    if (folderDerived) {
      return folderDerived;
    }
  }

  if (cloudflareUrl) {
    return cloudflareUrl;
  }

  if (firebaseUrl) {
    return firebaseUrl;
  }

  return "";
}

function resolvePartAudioSources(partKey, part, draft) {
  const directUrl = resolveDirectPartAudioUrl(partKey, part, draft);
  const setId = String(draft.setId || draft.id || "").trim();
  const objectKey = isPlayablePartKey(partKey) && setId ? `audio/listening/sets/${setId}${expectedPartSuffix(partKey)}` : "";
  const proxyUrl = buildProxyAudioUrl(objectKey);

  if (proxyUrl && directUrl) {
    return {
      primaryUrl: proxyUrl,
      fallbackUrl: directUrl,
      objectKey,
      setId
    };
  }

  return {
    primaryUrl: directUrl || proxyUrl,
    fallbackUrl: "",
    objectKey,
    setId
  };
}

async function reportAudioPlaybackEvent(payload) {
  if (!API_GATEWAY_BASE) {
    return;
  }

  try {
    await fetch(`${API_GATEWAY_BASE}/api/developer/audio-playback-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Best-effort telemetry only.
  }
}

function attachAudioHandlers() {
  const audios = refs.partsView.querySelectorAll("audio[data-primary-url]");

  for (const audio of audios) {
    if (audio.dataset.bound === "1") {
      continue;
    }

    audio.dataset.bound = "1";

    audio.addEventListener("loadeddata", () => {
      reportAudioPlaybackEvent({
        event: "loadeddata",
        setId: audio.dataset.setId || "",
        partKey: audio.dataset.partKey || "",
        source: audio.dataset.activeSource || "primary",
        currentSrc: audio.currentSrc || audio.src || "",
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
    });

    audio.addEventListener("error", async () => {
      const canFallback = audio.dataset.fallbackUrl && audio.dataset.triedFallback !== "1";

      if (canFallback) {
        audio.dataset.triedFallback = "1";
        audio.dataset.activeSource = "fallback";
        audio.src = audio.dataset.fallbackUrl;
        audio.load();

        await reportAudioPlaybackEvent({
          event: "fallback_activated",
          setId: audio.dataset.setId || "",
          partKey: audio.dataset.partKey || "",
          failedPrimaryUrl: audio.dataset.primaryUrl || "",
          fallbackUrl: audio.dataset.fallbackUrl || "",
          objectKey: audio.dataset.objectKey || "",
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        });

        return;
      }

      await reportAudioPlaybackEvent({
        event: "audio_error",
        setId: audio.dataset.setId || "",
        partKey: audio.dataset.partKey || "",
        source: audio.dataset.activeSource || "primary",
        objectKey: audio.dataset.objectKey || "",
        attemptedUrl: audio.currentSrc || audio.src || "",
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
    });
  }
}

function renderPart(partKey, part, draft) {
  const source = resolvePartAudioSources(partKey, part, draft);
  const { primaryUrl: audioUrl, fallbackUrl, objectKey, setId } = source;
  const safeFallbackAttr = fallbackUrl ? ` data-fallback-url="${escapeHtml(fallbackUrl)}"` : "";
  const safeObjectKeyAttr = objectKey ? ` data-object-key="${escapeHtml(objectKey)}"` : "";
  const safeSetIdAttr = setId ? ` data-set-id="${escapeHtml(setId)}"` : "";

  return `
    <article class="viewer-part">
      <h3>Part ${partKey}</h3>
      ${audioUrl ? `<audio class="audio" controls src="${escapeHtml(audioUrl)}" data-primary-url="${escapeHtml(audioUrl)}"${safeFallbackAttr}${safeObjectKeyAttr}${safeSetIdAttr} data-part-key="${escapeHtml(String(partKey))}" data-active-source="primary"></audio>` : "<p class=\"muted\">No audio URL yet. Upload and validate this part first.</p>"}

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

  const missingAudioParts = keys.filter((key) => {
    if (!isPlayablePartKey(key)) {
      return false;
    }

    const source = resolvePartAudioSources(key, parts[key] || {}, data);
    return !source.primaryUrl;
  });
  if (missingAudioParts.length) {
    refs.partsView.innerHTML = `<p class=\"muted\">Audio is not ready for part(s): ${missingAudioParts.join(", ")}. Ensure the URLs were saved to Firebase and the audio files exist in Cloudflare.</p>` + keys.map((key) => renderPart(key, parts[key] || {}, data)).join("");
    attachAudioHandlers();
    return;
  }

  refs.partsView.innerHTML = keys.map((key) => renderPart(key, parts[key] || {}, data)).join("");
  attachAudioHandlers();
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
  if (typeof indexed === "string" && indexed.trim()) {
    return indexed.trim();
  }

  if (indexed && typeof indexed === "object") {
    const setId = indexed.setId || indexed.id || indexed.value || "";
    return typeof setId === "string" ? setId.trim() : "";
  }

  return "";
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
    refs.testMeta.textContent = `Resolved setId from Firebase/date lookup: ${setId}`;

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
