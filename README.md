# TOEFL Listening Live Builder

This workspace now includes a 2-page app:

- `developer.html`: input/edit TOEFL listening set data (audio, questions, transcripts, answer key, explanation) and save to Firebase RTDB.
- `test.html`: live viewer for students/test mode. It auto-syncs in real time whenever data changes.

## Files

- `index.html` - quick launcher
- `developer.html` + `developer.js` - admin/developer page
- `test.html` + `test.js` - live test page
- `styles.css` - shared styles

## Firebase RTDB paths used

Base URL:

`https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app`

Draft data:

`/toefl_itp/drafts_v2/{setId}`

Date index for lookup by date:

`/toefl_itp/index_by_date/listening/{YYYY-MM-DD}` -> `setId`

## Set ID format

Generated format follows your requirement:

`mocktest_listening_YYYY-MM-DD_timestamp_random`

Example:

`mocktest_listening_2026-10-01_1785582930654_cz9uvu`

## How to use

1. Open `index.html`, then open Developer Page.
2. In Developer Page:
	- choose `Set Date`
	- click `Generate Set ID` (or paste existing one)
	- fill metadata and parts 1-3 fields
	- click `Save / Publish`
3. Open Test Page (button on developer page).
4. The test page connects to `setId` and receives live updates from RTDB stream.

## Cloudflare folder workflow

This project now supports your folder-based process:

1. In `developer.html`, generate `setId`.
	- `Generate Set ID` now auto-creates and saves `cloudflare_folder` metadata to Firebase.
2. Click `Build Cloudflare Folder` to auto-fill:

	`https://pub-1975cb14188340238a5d6d34750e4880.r2.dev/audio/listening/sets/{setId}`

3. Upload files in Cloudflare R2 console to that folder:
	- `part_1.mp3`
	- `part_2.mp3`
	- `part_3.mp3`
4. Click `Create Folder URL in Firebase` to persist `cloudflare_folder` metadata immediately.
5. Back in the app, click `Validate part_1 / part_2 / part_3` (or validate per part).
6. On successful all-part validation, URLs are auto-saved to Firebase under:
	- `parts/1/audio_cloudflare`
	- `parts/2/audio_cloudflare`
	- `parts/3/audio_cloudflare`

### Folder-first action

Use `Create Folder First` to run this sequence:

1. Generate new set ID
2. Build folder URL
3. Save folder metadata to Firebase

Then do manual upload in Cloudflare console:

4. Upload `part_1.mp3`, `part_2.mp3`, `part_3.mp3`
5. Click `Validate part_1 / part_2 / part_3`
6. App persists validated `audio_cloudflare` URLs to Firebase

Optional:

- You can set `Upload Pipeline Endpoint` and use `Upload via Pipeline` per part.
- For true folder placement, the gateway must honor `objectKey` exactly as `audio/listening/sets/{setId}/part_{n}.mp3`.
- The upload response should return JSON containing at least `uploadUrl` and `objectUrl`.

## Public runtime config

Use `app-config.js` for frontend-safe values:

- `rtdbBaseUrl`
- `cloudflarePublicBase`
- `uploadEndpoint`

Do not place private R2 credentials in client-side files.

## Notes

- Real-time updates use Firebase RTDB streaming (SSE) via REST endpoint.
- If your RTDB rules require auth, add auth handling/token support before production use.

## Troubleshooting: Cloudflare audio validation and CORS

If you open `developer.html` directly as `file://...`, browser origin becomes `null` and `fetch` validation can be blocked by CORS.

Recommended:

1. Run via HTTP locally (example: VS Code Live Server or `python -m http.server`).
2. Configure Cloudflare R2 CORS for your public bucket/domain.

Example R2 CORS rule:

```json
[
	{
		"AllowedOrigins": [
			"https://icha211.github.io",
			"http://localhost:3000",
			"http://localhost:8000"
		],
		"AllowedMethods": ["GET", "HEAD"],
		"AllowedHeaders": ["*"],
		"ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
		"MaxAgeSeconds": 3600
	}
]
```

Important: the app does not physically "create" folders in R2. Folder paths are virtual and effectively exist once objects (like `part_1.mp3`) are uploaded at that key path.