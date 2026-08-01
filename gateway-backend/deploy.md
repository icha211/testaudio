# Deploy

## Local container build

```bash
cd gateway-backend
docker build -t ielts-api-gateway .
```

If `docker` is not installed on your machine, skip the local build and use Cloud Build below.

## Deploy to Cloud Run with gcloud

Set your environment variables first:

```bash
export R2_ACCOUNT_ID=...
export R2_BUCKET_NAME=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev
export CORS_ORIGINS=https://icha211.github.io,http://localhost:3000,http://localhost:8000
```

PowerShell version:

```powershell
$env:R2_ACCOUNT_ID="..."
$env:R2_BUCKET_NAME="..."
$env:R2_ACCESS_KEY_ID="..."
$env:R2_SECRET_ACCESS_KEY="..."
$env:R2_PUBLIC_BASE_URL="https://pub-xxxxx.r2.dev"
$env:CORS_ORIGINS="https://icha211.github.io,http://localhost:3000,http://localhost:8000"
```

Then deploy:

```bash
gcloud run deploy ielts-api-gateway \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars R2_ACCOUNT_ID=$R2_ACCOUNT_ID,R2_BUCKET_NAME=$R2_BUCKET_NAME,R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY,R2_PUBLIC_BASE_URL=$R2_PUBLIC_BASE_URL,CORS_ORIGINS=$CORS_ORIGINS
```

PowerShell note: if you use `$env:` variables, the same command works, but Cloud Run reads the literal values from your environment at deploy time.

## Deploy with Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=asia-southeast1,_AR_REPO=ielts-api-gateway,_IMAGE_NAME=ielts-api-gateway .
```

Cloud Build now only builds and pushes the image. It does not deploy Cloud Run directly.

If you use Cloud Build for production, prefer Secret Manager or Cloud Run secrets for the R2 credentials rather than plain substitutions.

Cloud Build now checks for the Artifact Registry repo and creates it automatically if it does not exist.

After the build finishes, deploy the image separately:

```powershell
gcloud run deploy ielts-api-gateway --image asia-southeast1-docker.pkg.dev/$env:PROJECT_ID/ielts-api-gateway/ielts-api-gateway:latest --region asia-southeast1 --allow-unauthenticated --port 8080 --set-env-vars ^@^R2_ACCOUNT_ID=$env:R2_ACCOUNT_ID,R2_BUCKET_NAME=$env:R2_BUCKET_NAME,R2_ACCESS_KEY_ID=$env:R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY=$env:R2_SECRET_ACCESS_KEY,R2_PUBLIC_BASE_URL=$env:R2_PUBLIC_BASE_URL,CORS_ORIGINS=$env:CORS_ORIGINS^@^
```

This deploys the same gateway API surface the website is already wired to use:

- `POST /api/developer/ensure-audio-folder`
- `POST /api/developer/upload-url`
- `POST /api/developer/upload-proxy`
- `GET /api/developer/audio-url`
- `GET /api/developer/audio-exists`
- `GET /api/developer/audio-folder-contents`

## Recommended path on Windows

Because Docker is not installed, use Cloud Build directly from `gateway-backend`:

```powershell
gcloud builds submit --config cloudbuild.yaml .
```

If you need to pass substitutions explicitly:

```powershell
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=asia-southeast1,_AR_REPO=ielts-api-gateway,_IMAGE_NAME=ielts-api-gateway .
```

If you only need GitHub Pages access, you can also simplify `CORS_ORIGINS` to a single origin value, which avoids comma escaping entirely.
