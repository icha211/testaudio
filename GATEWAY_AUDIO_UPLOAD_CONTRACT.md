# Gateway Audio Upload Contract

This document defines the backend behavior required for the TOEFL listening website to upload audio directly into the intended Cloudflare R2 folder path.

The critical rule is:

- If the frontend sends `objectKey`, the gateway must use that exact key.
- The gateway must not rewrite the key to a timestamp-based or random path.

## Required endpoints

### `POST /api/developer/ensure-audio-folder`

Request JSON:

```json
{
  "setId": "mocktest_listening_2026-08-03_1785587019897_zft2tp",
  "testType": "mocktest"
}
```

Expected behavior:

1. Create a marker object in R2 for the folder prefix:
   - `audio/listening/sets/{setId}/.folder`
2. Return the public folder URL for the same prefix.
3. Store no audio here. This endpoint only prepares the folder path.

Expected response:

```json
{
  "setId": "mocktest_listening_2026-08-03_1785587019897_zft2tp",
  "folderKey": "audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/",
  "folderUrl": "https://pub-xxxxx.r2.dev/audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/",
  "markerKey": "audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/.folder",
  "createdAt": "2026-08-01T12:25:30.462Z"
}
```

### `POST /api/developer/upload-url`

Request JSON:

```json
{
  "objectKey": "audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/part_1.mp3",
  "fileName": "audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/part_1.mp3",
  "fileType": "audio/mpeg"
}
```

Expected behavior:

1. Use `objectKey` exactly as sent.
2. Do not generate a new key.
3. Return a signed PUT URL for that exact key.
4. Return the public URL that matches that same key.

Expected response:

```json
{
  "uploadUrl": "https://...signed-r2-put-url...",
  "objectKey": "audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/part_1.mp3",
  "objectUrl": "https://pub-xxxxx.r2.dev/audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/part_1.mp3",
  "expiresIn": 900
}
```

### `POST /api/developer/upload-proxy`

Request: `multipart/form-data`

Fields:

- `file`
- `objectKey`
- `fileType`

Expected behavior:

1. Use `objectKey` exactly as sent.
2. Upload the file to that exact R2 key.
3. Return the final public URL for that exact key.

Expected response:

```json
{
  "objectKey": "audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/part_1.mp3",
  "objectUrl": "https://pub-xxxxx.r2.dev/audio/listening/sets/mocktest_listening_2026-08-03_1785587019897_zft2tp/part_1.mp3",
  "contentType": "audio/mpeg",
  "size": 123456
}
```

## Reference pseudocode

```ts
// Shared helpers
function buildFolderKey(setId: string): string {
  return `audio/listening/sets/${setId}/`;
}

function buildMarkerKey(setId: string): string {
  return `audio/listening/sets/${setId}/.folder`;
}

function assertObjectKey(objectKey: string): string {
  if (!objectKey || !objectKey.startsWith("audio/listening/sets/")) {
    throw new Error("Invalid objectKey");
  }
  if (!objectKey.endsWith(".mp3")) {
    throw new Error("Invalid audio objectKey");
  }
  return objectKey;
}

// ensure-audio-folder
app.post("/api/developer/ensure-audio-folder", async (req, res) => {
  const { setId, testType } = req.body;
  if (!setId) return res.status(422).json({ error: "setId is required" });

  const folderKey = buildFolderKey(setId);
  const markerKey = buildMarkerKey(setId);

  await r2.put(markerKey, Buffer.from(""), {
    httpMetadata: { contentType: "text/plain" }
  });

  return res.json({
    setId,
    folderKey,
    folderUrl: `${PUBLIC_R2_BASE}/${folderKey}`,
    markerKey,
    createdAt: new Date().toISOString()
  });
});

// upload-url
app.post("/api/developer/upload-url", async (req, res) => {
  const { objectKey, fileName, fileType } = req.body;
  const finalKey = assertObjectKey(objectKey || fileName);

  const uploadUrl = await r2.getSignedUploadUrl(finalKey, {
    contentType: fileType || "audio/mpeg"
  });

  return res.json({
    uploadUrl,
    objectKey: finalKey,
    objectUrl: `${PUBLIC_R2_BASE}/${finalKey}`,
    expiresIn: 900
  });
});

// upload-proxy
app.post("/api/developer/upload-proxy", upload.single("file"), async (req, res) => {
  const objectKey = assertObjectKey(req.body.objectKey || req.body.fileName);
  const file = req.file;

  if (!file) return res.status(422).json({ error: "file is required" });

  await r2.put(objectKey, file.buffer, {
    httpMetadata: {
      contentType: req.body.fileType || file.mimetype || "audio/mpeg"
    }
  });

  return res.json({
    objectKey,
    objectUrl: `${PUBLIC_R2_BASE}/${objectKey}`,
    contentType: req.body.fileType || file.mimetype || "audio/mpeg",
    size: file.size
  });
});
```

## Notes

- The frontend is already prepared to send the exact `objectKey`.
- The gateway must not replace it with a timestamp-based key.
- If the gateway cannot honor `objectKey`, folder-based upload will not work.
