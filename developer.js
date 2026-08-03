const APP_CONFIG = window.APP_CONFIG || {};
const RTDB_BASE = APP_CONFIG.rtdbBaseUrl || "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";
const DRAFTS_PATH = "/toefl_itp/drafts_v2";
const DATE_INDEX_PATH = "/toefl_itp/index_by_date/listening";
const PUBLIC_R2_DEV_BASE = APP_CONFIG.cloudflarePublicBase || "https://pub-1975cb14188340238a5d6d34750e4880.r2.dev";
const API_GATEWAY_BASE = (APP_CONFIG.apiGatewayBase || "").trim().replace(/\/+$/, "");
const DEFAULT_UPLOAD_ENDPOINT = APP_CONFIG.uploadEndpoint || (API_GATEWAY_BASE ? `${API_GATEWAY_BASE}/api/developer/upload-url` : "");
const ENSURE_FOLDER_ENDPOINT = API_GATEWAY_BASE ? `${API_GATEWAY_BASE}/api/developer/ensure-audio-folder` : "";
const UPLOAD_URL_ENDPOINT = API_GATEWAY_BASE ? `${API_GATEWAY_BASE}/api/developer/upload-url` : "";
const PART_KEYS = ["1", "2", "3"];

const audioUrlsByPart = {
  "1": "",
  "2": "",
  "3": ""
};

const refs = {
  setDate: document.getElementById("setDate"),
  setId: document.getElementById("setId"),
  difficulty: document.getElementById("difficulty"),
  testType: document.getElementById("testType"),
  module: document.getElementById("module"),
  label: document.getElementById("label"),
  cloudflareFolder: document.getElementById("cloudflareFolder"),
  uploadEndpoint: document.getElementById("uploadEndpoint"),
  status: document.getElementById("devStatus"),
  partsContainer: document.getElementById("partsContainer"),
  openTestLink: document.getElementById("openTestLink")
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function randomToken(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length);
}

function generateSetId(dateStr) {
  const safeDate = dateStr || todayString();
  return `mocktest_listening_${safeDate}_${Date.now()}_${randomToken()}`;
}

function setStatus(message, kind = "ok") {
  refs.status.textContent = message;
  refs.status.className = `status ${kind}`;
}

function apiUrl(path) {
  return `${RTDB_BASE}${path}.json`;
}

function normalizeFolderUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function normalizeUploadEndpoint(url) {
  const clean = (url || "").trim();
  if (!clean) {
    return "";
  }

  // Legacy configs may still point to upload-proxy. The current flow needs upload-url.
  if (clean.includes("/api/developer/upload-proxy")) {
    return clean.replace("/api/developer/upload-proxy", "/api/developer/upload-url");
  }

  return clean;
}

function buildDefaultCloudflareFolder(setId) {
  return `${PUBLIC_R2_DEV_BASE}/audio/listening/sets/${setId}`;
}

function getCloudflareFolder() {
  return normalizeFolderUrl(refs.cloudflareFolder.value);
}

function expectedPartUrl(partKey, folderUrl = getCloudflareFolder()) {
  return `${folderUrl}/part_${partKey}.mp3`;
}

function expectedObjectKey(setId, partKey) {
  return `audio/listening/sets/${setId}/part_${partKey}.mp3`;
}

function getPartStatusEl(partKey) {
  const card = getPartCard(partKey);
  return card?.querySelector("[data-role=partStatus]");
}

function setPartStatus(partKey, message, kind = "ok") {
  const el = getPartStatusEl(partKey);
  if (!el) {
    return;
  }
  el.textContent = message;
  el.className = `status ${kind}`;
}

async function rtdbGet(path) {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`GET failed (${response.status})`);
  }
  return response.json();
}

async function rtdbPut(path, body) {
  const response = await fetch(apiUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`PUT failed (${response.status})`);
  }
  return response.json();
}

async function rtdbPatch(path, body) {
  const response = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`PATCH failed (${response.status})`);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`POST failed (${response.status})`);
  }

  return response.json();
}

function partTemplate(partNumber) {
  return `
    <div class="part-card" data-part="${partNumber}">
      <div class="part-header">
        <h3>Part ${partNumber}</h3>
        <span class="badge">part_${partNumber}.mp3</span>
      </div>
      <div class="form-grid">
        <div class="full">
          <label>Audio Cloudflare URL</label>
          <input data-field="audio_cloudflare" placeholder="https://.../part_${partNumber}.mp3" />
        </div>
        <div class="full">
          <label>Upload Audio (optional direct pipeline)</label>
          <input type="file" accept="audio/*" data-file-part="${partNumber}" />
        </div>
        <div class="full actions">
          <button type="button" class="alt" data-action="upload-part" data-part="${partNumber}">Upload via Pipeline</button>
          <button type="button" class="alt" data-action="validate-part" data-part="${partNumber}">Validate part_${partNumber}.mp3</button>
        </div>
        <div class="full">
          <p class="muted" data-role="expectedUrl">Expected: part_${partNumber}.mp3 in cloudflare_folder</p>
          <p class="status" data-role="partStatus"></p>
        </div>
        <div class="full">
          <label>Audio Firebase URL (optional)</label>
          <input data-field="audio_firebase" placeholder="Optional" />
        </div>
        <div class="full">
          <label>Questions</label>
          <textarea data-field="questions"></textarea>
        </div>
        <div class="full">
          <label>Transcripts</label>
          <textarea data-field="transcripts"></textarea>
        </div>
        <div class="full">
          <label>Answer Key</label>
          <textarea data-field="answerKey"></textarea>
        </div>
        <div class="full">
          <label>Explanation</label>
          <textarea data-field="explanation"></textarea>
        </div>
      </div>
    </div>
  `;
}

function renderParts() {
  refs.partsContainer.innerHTML = PART_KEYS.map(partTemplate).join("");
}

function getPartCard(partKey) {
  return refs.partsContainer.querySelector(`[data-part=\"${partKey}\"]`);
}

function collectParts() {
  const parts = {};

  for (const partKey of PART_KEYS) {
    const card = getPartCard(partKey);
    const fields = card.querySelectorAll("[data-field]");
    const data = {};

    for (const field of fields) {
      data[field.dataset.field] = field.value?.trim() || "";
    }

    if (!data.audio_cloudflare && audioUrlsByPart[partKey]) {
      data.audio_cloudflare = audioUrlsByPart[partKey];
    }

    parts[partKey] = data;
  }

  return parts;
}

function fillParts(parts) {
  for (const partKey of PART_KEYS) {
    const card = getPartCard(partKey);
    const partData = parts?.[partKey] || {};
    const fields = card.querySelectorAll("[data-field]");

    for (const field of fields) {
      const value = partData[field.dataset.field];
      field.value = typeof value === "string" ? value : "";
    }

    audioUrlsByPart[partKey] = partData.audio_cloudflare || "";
    updateExpectedUrlHint(partKey);
  }
}

function updateExpectedUrlHint(partKey) {
  const card = getPartCard(partKey);
  if (!card) {
    return;
  }

  const expectedEl = card.querySelector("[data-role=expectedUrl]");
  const folder = getCloudflareFolder();
  const expected = folder ? expectedPartUrl(partKey, folder) : "(set cloudflare_folder first)";

  if (expectedEl) {
    expectedEl.textContent = `Expected: ${expected}`;
  }
}

function updateAllExpectedUrlHints() {
  for (const partKey of PART_KEYS) {
    updateExpectedUrlHint(partKey);
  }
}

function setPartAudioUrl(partKey, url) {
  const card = getPartCard(partKey);
  const input = card?.querySelector('[data-field="audio_cloudflare"]');
  const cleanUrl = (url || "").trim();

  audioUrlsByPart[partKey] = cleanUrl;
  if (input) {
    input.value = cleanUrl;
  }
}

function ensureIdsAndFolder() {
  const setDate = refs.setDate.value || todayString();
  refs.setDate.value = setDate;

  if (!refs.setId.value.trim()) {
    refs.setId.value = generateSetId(setDate);
  }

  if (!refs.cloudflareFolder.value.trim()) {
    refs.cloudflareFolder.value = buildDefaultCloudflareFolder(refs.setId.value.trim());
  }

  updateAllExpectedUrlHints();
  updateTestLink();
}

function buildFolderRecordPayload(setId) {
  const nowIso = new Date().toISOString();
  return {
    _updatedAt: nowIso,
    updatedAt: nowIso,
    setDate: refs.setDate.value || todayString(),
    setId,
    id: setId,
    testType: refs.testType.value.trim() || "mocktest",
    module: refs.module.value.trim() || "listening",
    label: refs.label.value.trim() || "Listening",
    difficulty: refs.difficulty.value || "intermediate",
    cloudflare_folder: getCloudflareFolder()
  };
}

async function saveFolderRecordToFirebase() {
  ensureIdsAndFolder();

  const setId = refs.setId.value.trim();
  const setDate = refs.setDate.value;

  // If gateway is configured, ask backend to materialize folder marker in R2.
  if (ENSURE_FOLDER_ENDPOINT) {
    try {
      const ensureResult = await postJson(ENSURE_FOLDER_ENDPOINT, {
        setId,
        testType: refs.testType.value.trim() || "mocktest"
      });

      if (ensureResult?.folderUrl) {
        refs.cloudflareFolder.value = normalizeFolderUrl(ensureResult.folderUrl);
        updateAllExpectedUrlHints();
      }
    } catch (error) {
      setStatus(`Gateway folder ensure failed: ${error.message}. Using local folder URL pattern.`, "warn");
    }
  }

  const payload = buildFolderRecordPayload(setId);

  await rtdbPatch(`${DRAFTS_PATH}/${setId}`, payload);
  await rtdbPut(`${DATE_INDEX_PATH}/${setDate}`, setId);

  localStorage.setItem("toefl_listening_last_set_id", setId);
}

async function saveValidatedPartUrlsToFirebase() {
  ensureIdsAndFolder();

  const setId = refs.setId.value.trim();
  const setDate = refs.setDate.value || todayString();
  const nowIso = new Date().toISOString();
  const patchPayload = {
    _updatedAt: nowIso,
    updatedAt: nowIso,
    cloudflare_folder: getCloudflareFolder(),
    parts: {}
  };

  for (const partKey of PART_KEYS) {
    patchPayload.parts[partKey] = {
      audio_cloudflare: audioUrlsByPart[partKey] || ""
    };
  }

  await rtdbPatch(`${DRAFTS_PATH}/${setId}`, patchPayload);
  await rtdbPut(`${DATE_INDEX_PATH}/${setDate}`, setId);
}

async function saveSinglePartAudioUrlToFirebase(partKey, audioUrl) {
  ensureIdsAndFolder();

  const setId = refs.setId.value.trim();
  const setDate = refs.setDate.value || todayString();
  const nowIso = new Date().toISOString();
  const patchPayload = {
    _updatedAt: nowIso,
    updatedAt: nowIso,
    cloudflare_folder: getCloudflareFolder(),
    parts: {
      [partKey]: {
        audio_cloudflare: audioUrl
      }
    }
  };

  await rtdbPatch(`${DRAFTS_PATH}/${setId}`, patchPayload);
  await rtdbPut(`${DATE_INDEX_PATH}/${setDate}`, setId);
}

async function checkAudioUrlExists(url) {
  if (window.location.protocol === "file:") {
    return null;
  }

  try {
    const headResponse = await fetch(url, { method: "HEAD" });
    if (headResponse.ok) {
      return true;
    }
  } catch {
    // Fall through to GET probe.
  }

  try {
    const getResponse = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" }
    });
    return getResponse.ok;
  } catch {
    return false;
  }
}

async function validatePartAudio(partKey) {
  const folder = getCloudflareFolder();
  if (!folder) {
    setPartStatus(partKey, "Set Cloudflare folder URL first.", "warn");
    return false;
  }

  const url = expectedPartUrl(partKey, folder);
  setPartStatus(partKey, "Validating public URL...", "ok");

  const exists = await checkAudioUrlExists(url);
  if (exists === null) {
    setPartAudioUrl(partKey, url);
    setPartStatus(partKey, "Running on file://, so CORS blocks fetch validation. URL was mapped; test from http/https.", "warn");
    return true;
  }

  if (!exists) {
    setPartStatus(partKey, "Not found or not publicly accessible.", "warn");
    return false;
  }

  setPartAudioUrl(partKey, url);
  setPartStatus(partKey, "Validated and linked to this part.", "ok");
  return true;
}

async function validateAllParts() {
  setStatus("Validating part_1, part_2, part_3 from Cloudflare folder...", "ok");

  let okCount = 0;
  for (const partKey of PART_KEYS) {
    // Sequential checks keep statuses in clear order for each part.
    // eslint-disable-next-line no-await-in-loop
    const ok = await validatePartAudio(partKey);
    if (ok) {
      okCount += 1;
    }
  }

  if (okCount === PART_KEYS.length) {
    await saveValidatedPartUrlsToFirebase();
    setStatus("All parts validated and audio_cloudflare URLs were saved to Firebase.", "ok");
  } else {
    setStatus(`Validated ${okCount}/${PART_KEYS.length} parts. Check missing files or URL visibility.`, "warn");
  }
}

async function runOneClickPipeline() {
  refs.setId.value = generateSetId(refs.setDate.value || todayString());
  refs.cloudflareFolder.value = buildDefaultCloudflareFolder(refs.setId.value);
  updateAllExpectedUrlHints();
  updateTestLink();

  setStatus("Generated set ID. Saving folder metadata to Firebase...", "ok");
  await saveFolderRecordToFirebase();

  setStatus("Folder path saved. Next: upload part_1.mp3, part_2.mp3, part_3.mp3 in Cloudflare console, then click Validate.", "ok");
}

function requireSetIdAndFolder() {
  const setId = refs.setId.value.trim();
  if (!setId) {
    throw new Error("Set ID is required first.");
  }

  if (!getCloudflareFolder()) {
    refs.cloudflareFolder.value = buildDefaultCloudflareFolder(setId);
  }

  updateAllExpectedUrlHints();
  return setId;
}

async function uploadPartViaPipeline(partKey) {
  const setId = requireSetIdAndFolder();
  const uploadUrlEndpoint = refs.uploadEndpoint.value.trim() || UPLOAD_URL_ENDPOINT;
  const card = getPartCard(partKey);
  const fileInput = card?.querySelector(`[data-file-part=\"${partKey}\"]`);
  const file = fileInput?.files?.[0];

  if (!uploadUrlEndpoint) {
    setPartStatus(partKey, "Upload URL endpoint not configured. The gateway must support signed uploads.", "warn");
    return;
  }

  if (!file) {
    setPartStatus(partKey, "Choose an audio file first.", "warn");
    return;
  }

  await saveFolderRecordToFirebase();

  const objectKey = expectedObjectKey(setId, partKey);
  setPartStatus(partKey, "Requesting signed upload URL for exact folder path...", "ok");

  const signedResponse = await fetch(uploadUrlEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectKey,
      fileName: objectKey,
      fileType: file.type || "audio/mpeg"
    })
  });

  if (!signedResponse.ok) {
    throw new Error(`Signed URL request failed (${signedResponse.status})`);
  }

  const result = await signedResponse.json();
  const uploadUrl = result.uploadUrl || "";
  const returnedObjectKey = String(result.objectKey || "").trim();

  if (returnedObjectKey && returnedObjectKey !== objectKey) {
    throw new Error(`Upload endpoint returned wrong objectKey: ${returnedObjectKey}. Expected: ${objectKey}`);
  }

  if (!uploadUrl.includes(`part_${partKey}.mp3`)) {
    throw new Error("Upload URL does not target the selected part file name. Please use /api/developer/upload-url from this gateway.");
  }

  if (!uploadUrl) {
    throw new Error("Signed URL response did not include uploadUrl.");
  }

  setPartStatus(partKey, "Uploading MP3 into the folder path...", "ok");

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "audio/mpeg"
    },
    body: file
  });

  if (!putResponse.ok) {
    throw new Error(`R2 upload failed (${putResponse.status})`);
  }

  const finalPublicUrl = `${PUBLIC_R2_DEV_BASE.replace(/\/+$/, "")}/${objectKey}`;
  if (!finalPublicUrl) {
    throw new Error("Upload succeeded but no public URL was returned.");
  }

  setPartAudioUrl(partKey, finalPublicUrl);
  await saveSinglePartAudioUrlToFirebase(partKey, finalPublicUrl);
  setPartStatus(partKey, `Upload completed. ${file.name} was stored as part_${partKey}.mp3 and URL mapped to this part.`, "ok");
}

function getSelectedAudioFileCount() {
  let count = 0;
  for (const partKey of PART_KEYS) {
    const card = getPartCard(partKey);
    const fileInput = card?.querySelector(`[data-file-part="${partKey}"]`);
    if (fileInput?.files?.[0]) {
      count += 1;
    }
  }
  return count;
}

async function uploadSelectedPartFilesIfConfigured() {
  const uploadEndpoint = refs.uploadEndpoint.value.trim();
  const selectedCount = getSelectedAudioFileCount();

  if (!selectedCount) {
    return { uploadedCount: 0, reason: "no-files-selected" };
  }

  if (!uploadEndpoint) {
    return { uploadedCount: 0, reason: "no-upload-endpoint" };
  }

  let uploadedCount = 0;
  for (const partKey of PART_KEYS) {
    const card = getPartCard(partKey);
    const fileInput = card?.querySelector(`[data-file-part="${partKey}"]`);
    if (!fileInput?.files?.[0]) {
      continue;
    }

    // Sequential upload keeps statuses readable.
    // eslint-disable-next-line no-await-in-loop
    await uploadPartViaPipeline(partKey);
    uploadedCount += 1;
  }

  return { uploadedCount, reason: "uploaded" };
}

function buildDraftPayload() {
  const setDate = refs.setDate.value || todayString();
  const setId = refs.setId.value?.trim() || generateSetId(setDate);
  const nowIso = new Date().toISOString();

  refs.setId.value = setId;
  refs.setDate.value = setDate;

  if (!refs.cloudflareFolder.value.trim()) {
    refs.cloudflareFolder.value = buildDefaultCloudflareFolder(setId);
  }

  updateAllExpectedUrlHints();

  return {
    _updatedAt: nowIso,
    updatedAt: nowIso,
    setDate,
    setId,
    id: setId,
    testType: refs.testType.value.trim() || "mocktest",
    module: refs.module.value.trim() || "listening",
    label: refs.label.value.trim() || "Listening",
    difficulty: refs.difficulty.value || "intermediate",
    cloudflare_folder: refs.cloudflareFolder.value.trim() || "",
    parts: collectParts()
  };
}

async function loadDraftBySetId(setId) {
  if (!setId) {
    setStatus("Please provide a set ID first.", "warn");
    return;
  }

  const data = await rtdbGet(`${DRAFTS_PATH}/${setId}`);
  if (!data) {
    setStatus("No draft found for that set ID.", "warn");
    return;
  }

  refs.setDate.value = data.setDate || "";
  refs.setId.value = data.setId || setId;
  refs.difficulty.value = data.difficulty || "intermediate";
  refs.testType.value = data.testType || "mocktest";
  refs.module.value = data.module || "listening";
  refs.label.value = data.label || "Listening";
  refs.cloudflareFolder.value = data.cloudflare_folder || "";
  fillParts(data.parts || {});

  localStorage.setItem("toefl_listening_last_set_id", refs.setId.value);
  setStatus("Draft loaded successfully.", "ok");
  updateTestLink();
}

async function loadLatestByDate(dateStr) {
  if (!dateStr) {
    setStatus("Please pick a date first.", "warn");
    return;
  }

  const setId = await rtdbGet(`${DATE_INDEX_PATH}/${dateStr}`);
  if (!setId || typeof setId !== "string") {
    setStatus("No set ID found in date index for that date.", "warn");
    return;
  }

  await loadDraftBySetId(setId);
}

async function saveDraft() {
  try {
    const payload = buildDraftPayload();
    const { setId } = payload;

    setStatus("Saving draft to Firebase...", "ok");

    await rtdbPut(`${DRAFTS_PATH}/${setId}`, payload);
    await rtdbPut(`${DATE_INDEX_PATH}/${payload.setDate}`, setId);

    localStorage.setItem("toefl_listening_last_set_id", setId);
    setStatus(`Saved ${setId}. Test page will receive real-time updates.`, "ok");
    updateTestLink();
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, "warn");
  }
}

function updateTestLink() {
  const params = new URLSearchParams();
  if (refs.setId.value) {
    params.set("setId", refs.setId.value);
  }
  if (refs.setDate.value) {
    params.set("setDate", refs.setDate.value);
  }
  refs.openTestLink.href = `test.html?${params.toString()}`;
}

function buildCloudflareFolderFromSetId() {
  const setId = refs.setId.value.trim();
  if (!setId) {
    throw new Error("Set ID is required to build cloudflare_folder.");
  }

  refs.cloudflareFolder.value = buildDefaultCloudflareFolder(setId);
  updateAllExpectedUrlHints();
}

function initDefaultValues() {
  const lastSetId = localStorage.getItem("toefl_listening_last_set_id") || "";
  const savedUploadEndpoint = normalizeUploadEndpoint(localStorage.getItem("toefl_listening_upload_endpoint") || "");
  refs.setDate.value = todayString();
  refs.setId.value = lastSetId;

  refs.uploadEndpoint.value = normalizeUploadEndpoint(savedUploadEndpoint || DEFAULT_UPLOAD_ENDPOINT);
  localStorage.setItem("toefl_listening_upload_endpoint", refs.uploadEndpoint.value);

  if (lastSetId) {
    refs.cloudflareFolder.value = buildDefaultCloudflareFolder(lastSetId);
  }

  updateAllExpectedUrlHints();
  updateTestLink();
}

function bindEvents() {
  document.getElementById("btnGenerateId").addEventListener("click", async () => {
    try {
      refs.setId.value = generateSetId(refs.setDate.value || todayString());
      refs.cloudflareFolder.value = buildDefaultCloudflareFolder(refs.setId.value);
      updateAllExpectedUrlHints();
      updateTestLink();

      setStatus("Generated new set ID. Saving folder URL metadata to Firebase...", "ok");
      await saveFolderRecordToFirebase();
      setStatus("Generated set ID and auto-saved cloudflare_folder to Firebase.", "ok");
    } catch (error) {
      setStatus(`Generate + save failed: ${error.message}`, "warn");
    }
  });

  document.getElementById("btnOneClickPipeline").addEventListener("click", async () => {
    try {
      await runOneClickPipeline();
    } catch (error) {
      setStatus(`Create folder flow failed: ${error.message}`, "warn");
    }
  });

  document.getElementById("btnBuildFolder").addEventListener("click", () => {
    try {
      buildCloudflareFolderFromSetId();
      setStatus("Cloudflare folder URL generated from set ID.", "ok");
    } catch (error) {
      setStatus(error.message, "warn");
    }
  });

  document.getElementById("btnCreateFolderDraft").addEventListener("click", async () => {
    try {
      ensureIdsAndFolder();
      await saveFolderRecordToFirebase();
      setStatus("Folder URL was created and saved to Firebase draft metadata.", "ok");
    } catch (error) {
      setStatus(`Create folder record failed: ${error.message}`, "warn");
    }
  });

  document.getElementById("btnLoadById").addEventListener("click", async () => {
    try {
      setStatus("Loading by set ID...", "ok");
      await loadDraftBySetId(refs.setId.value.trim());
    } catch (error) {
      setStatus(`Load failed: ${error.message}`, "warn");
    }
  });

  document.getElementById("btnLoadByDate").addEventListener("click", async () => {
    try {
      setStatus("Loading latest set by date...", "ok");
      await loadLatestByDate(refs.setDate.value);
    } catch (error) {
      setStatus(`Load by date failed: ${error.message}`, "warn");
    }
  });

  document.getElementById("btnSave").addEventListener("click", saveDraft);
  document.getElementById("btnValidateAll").addEventListener("click", async () => {
    try {
      await validateAllParts();
    } catch (error) {
      setStatus(`Validation failed: ${error.message}`, "warn");
    }
  });

  refs.setDate.addEventListener("change", () => {
    if (!refs.setId.value.trim()) {
      refs.setId.value = generateSetId(refs.setDate.value);
      refs.cloudflareFolder.value = buildDefaultCloudflareFolder(refs.setId.value);
    }
    updateAllExpectedUrlHints();
    updateTestLink();
  });

  refs.setId.addEventListener("input", () => {
    updateTestLink();
  });

  refs.cloudflareFolder.addEventListener("input", updateAllExpectedUrlHints);
  refs.uploadEndpoint.addEventListener("change", () => {
    const normalized = normalizeUploadEndpoint(refs.uploadEndpoint.value);
    refs.uploadEndpoint.value = normalized;
    localStorage.setItem("toefl_listening_upload_endpoint", normalized);
  });

  refs.partsContainer.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const { part: partKey, action } = button.dataset;
    if (!partKey || !PART_KEYS.includes(partKey)) {
      return;
    }

    try {
      if (action === "validate-part") {
        await validatePartAudio(partKey);
      }

      if (action === "upload-part") {
        await uploadPartViaPipeline(partKey);
      }
    } catch (error) {
      setPartStatus(partKey, error.message, "warn");
    }
  });

  refs.partsContainer.addEventListener("input", (event) => {
    const { target } = event;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.field !== "audio_cloudflare") {
      return;
    }

    const card = target.closest("[data-part]");
    const partKey = card?.getAttribute("data-part");
    if (!partKey || !PART_KEYS.includes(partKey)) {
      return;
    }

    audioUrlsByPart[partKey] = target.value.trim();
  });
}

renderParts();
initDefaultValues();
bindEvents();
