import os
import re
from datetime import datetime, timezone
from typing import List, Optional

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip()
BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "").strip()
ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_BASE_URL", "https://pub-1975cb14188340238a5d6d34750e4880.r2.dev").rstrip("/")
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

if not ACCOUNT_ID:
    raise RuntimeError("R2_ACCOUNT_ID is required")
if not BUCKET_NAME:
    raise RuntimeError("R2_BUCKET_NAME is required")
if not ACCESS_KEY_ID:
    raise RuntimeError("R2_ACCESS_KEY_ID is required")
if not SECRET_ACCESS_KEY:
    raise RuntimeError("R2_SECRET_ACCESS_KEY is required")

R2_ENDPOINT = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"
S3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=ACCESS_KEY_ID,
    aws_secret_access_key=SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

app = FastAPI(title="IELTS Check API Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in CORS_ORIGINS else CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

SET_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
OBJECT_KEY_RE = re.compile(r"^audio/listening/sets/([A-Za-z0-9_-]+)/part_([123])\.mp3$")


class EnsureAudioFolderRequest(BaseModel):
    setId: str = Field(min_length=1)
    testType: Optional[str] = None


class EnsureAudioFolderResponse(BaseModel):
    setId: str
    folderKey: str
    folderUrl: str
    markerKey: str
    createdAt: str


class UploadUrlRequest(BaseModel):
    objectKey: str = Field(min_length=1)
    fileName: str = Field(min_length=1)
    fileType: str = Field(min_length=1)


class UploadUrlResponse(BaseModel):
    uploadUrl: str
    objectKey: str
    objectUrl: str
    expiresIn: int


class AudioExistsResponse(BaseModel):
    objectKey: str
    exists: bool
    error: str = ""


class AudioUrlResponse(BaseModel):
    objectKey: str
    objectUrl: str


class AudioFolderContentsResponse(BaseModel):
    setId: str
    folderKey: str
    contents: List[str]


class UploadProxyResponse(BaseModel):
    objectKey: str
    objectUrl: str
    contentType: str
    size: int


@app.get("/health")
def health():
    return {"ok": True, "service": "ielts-check-api-gateway"}


@app.post("/api/developer/ensure-audio-folder", response_model=EnsureAudioFolderResponse)
def ensure_audio_folder(payload: EnsureAudioFolderRequest):
    set_id = payload.setId.strip()
    if not SET_ID_RE.match(set_id):
        raise HTTPException(status_code=422, detail="Invalid setId")

    folder_key = f"audio/listening/sets/{set_id}/"
    marker_key = f"{folder_key}.folder"
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        S3.put_object(
            Bucket=BUCKET_NAME,
            Key=marker_key,
            Body=b"",
            ContentType="text/plain",
            CacheControl="no-store",
        )
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create folder marker: {exc}") from exc

    return EnsureAudioFolderResponse(
        setId=set_id,
        folderKey=folder_key,
        folderUrl=f"{PUBLIC_BASE_URL}/{folder_key}",
        markerKey=marker_key,
        createdAt=now_iso,
    )


@app.post("/api/developer/upload-url", response_model=UploadUrlResponse)
def create_upload_url(payload: UploadUrlRequest):
    object_key = payload.objectKey.strip()
    if not OBJECT_KEY_RE.match(object_key):
        raise HTTPException(
            status_code=422,
            detail="objectKey must be audio/listening/sets/{setId}/part_1.mp3, part_2.mp3, or part_3.mp3",
        )

    upload_url = S3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": object_key,
            "ContentType": payload.fileType,
        },
        ExpiresIn=900,
    )

    return UploadUrlResponse(
        uploadUrl=upload_url,
        objectKey=object_key,
        objectUrl=f"{PUBLIC_BASE_URL}/{object_key}",
        expiresIn=900,
    )


@app.post("/api/developer/upload-proxy", response_model=UploadProxyResponse)
async def upload_proxy(
    file: UploadFile = File(...),
    objectKey: str = Form(...),
    fileType: str = Form(...),
):
    object_key = objectKey.strip()
    if not OBJECT_KEY_RE.match(object_key):
        raise HTTPException(
            status_code=422,
            detail="objectKey must be audio/listening/sets/{setId}/part_1.mp3, part_2.mp3, or part_3.mp3",
        )

    body = await file.read()
    try:
        S3.put_object(
            Bucket=BUCKET_NAME,
            Key=object_key,
            Body=body,
            ContentType=fileType or file.content_type or "audio/mpeg",
        )
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload object: {exc}") from exc

    return UploadProxyResponse(
        objectKey=object_key,
        objectUrl=f"{PUBLIC_BASE_URL}/{object_key}",
        contentType=fileType or file.content_type or "audio/mpeg",
        size=len(body),
    )


@app.get("/api/developer/audio-url", response_model=AudioUrlResponse)
def audio_url(objectKey: str = Query(..., min_length=1)):
    object_key = objectKey.strip()
    return AudioUrlResponse(objectKey=object_key, objectUrl=f"{PUBLIC_BASE_URL}/{object_key}")


@app.get("/api/developer/audio-exists", response_model=AudioExistsResponse)
def audio_exists(objectKey: str = Query(..., min_length=1)):
    object_key = objectKey.strip()
    try:
        S3.head_object(Bucket=BUCKET_NAME, Key=object_key)
        return AudioExistsResponse(objectKey=object_key, exists=True)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")
        if error_code in {"404", "NoSuchKey", "NotFound"}:
            return AudioExistsResponse(objectKey=object_key, exists=False)
        raise HTTPException(status_code=500, detail=f"Head object failed: {exc}") from exc


@app.get("/api/developer/audio-folder-contents", response_model=AudioFolderContentsResponse)
def audio_folder_contents(setId: str = Query(..., min_length=1)):
    set_id = setId.strip()
    if not SET_ID_RE.match(set_id):
        raise HTTPException(status_code=422, detail="Invalid setId")

    folder_key = f"audio/listening/sets/{set_id}/"
    try:
        resp = S3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=folder_key)
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"List objects failed: {exc}") from exc

    contents = [item["Key"] for item in resp.get("Contents", []) if item.get("Key") != f"{folder_key}.folder"]
    return AudioFolderContentsResponse(setId=set_id, folderKey=folder_key, contents=contents)


@app.exception_handler(Exception)
def unhandled_exception_handler(_, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc)})
