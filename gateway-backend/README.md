# IELTS Check API Gateway

A small FastAPI gateway for Cloudflare R2 audio uploads that preserves exact `objectKey` paths.

## Environment variables

- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` (optional, default: `https://pub-xxxxx.r2.dev`)
- `CORS_ORIGINS` (optional, comma-separated, default: `*`)

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

## Endpoints

- `GET /health`
- `POST /api/developer/ensure-audio-folder`
- `POST /api/developer/upload-url`
- `POST /api/developer/upload-proxy`
- `GET /api/developer/audio-url`
- `GET /api/developer/audio-proxy`
- `GET /api/developer/audio-exists`
- `GET /api/developer/audio-folder-contents`

## Contract summary

- `ensure-audio-folder` creates `audio/listening/sets/{setId}/.folder`
- `upload-url` must honor the exact `objectKey` provided by the frontend
- `upload-proxy` must also honor the exact `objectKey` provided by the frontend
- `audio-proxy` streams audio through the API so playback can avoid the public R2 hostname
- No timestamp-based object keys should be generated for listening part uploads
