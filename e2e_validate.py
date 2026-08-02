import requests, time, json
from datetime import datetime

api_base = 'https://ielts-api-gateway-753959270698.asia-southeast1.run.app'
rtdb_base = 'https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app'
public_base = 'https://pub-1975cb14188340238a5d6d34750e4880.r2.dev'

set_date = datetime.utcnow().strftime('%Y-%m-%d')
set_id = f"mocktest_listening_{set_date}_{int(time.time())}_e2e"

results = {}

# 1) Create folder marker
r = requests.post(api_base + '/api/developer/ensure-audio-folder', json={'setId': set_id, 'testType': 'mocktest'}, timeout=20)
results['ensure_audio_folder'] = {'status': r.status_code, 'ok': r.ok, 'body': r.json() if r.ok else r.text}

# 2) Upload 3 small audio blobs with exact objectKey via signed URL
uploaded = []
for part in [1, 2, 3]:
    object_key = f'audio/listening/sets/{set_id}/part_{part}.mp3'
    req = {'objectKey': object_key, 'fileName': object_key, 'fileType': 'audio/mpeg'}
    ru = requests.post(api_base + '/api/developer/upload-url', json=req, timeout=20)
    if not ru.ok:
        uploaded.append({'part': part, 'upload_url_status': ru.status_code, 'ok': False, 'error': ru.text})
        continue
    u = ru.json()
    payload = b'ID3\x04\x00\x00\x00\x00\x00\x21e2e-audio-part-' + bytes(str(part), 'utf-8')
    put = requests.put(u['uploadUrl'], data=payload, headers={'Content-Type': 'audio/mpeg'}, timeout=30)
    head = requests.head(u['objectUrl'], timeout=20, allow_redirects=True)
    uploaded.append({
        'part': part,
        'objectKey_requested': object_key,
        'objectKey_returned': u.get('objectKey'),
        'keys_match': u.get('objectKey') == object_key,
        'put_status': put.status_code,
        'public_head_status': head.status_code,
        'objectUrl': u.get('objectUrl')
    })
results['upload_parts'] = uploaded

# 3) Save draft + date index like developer page
parts = [None]
for item in uploaded:
    if item.get('objectUrl'):
        parts.append({
            'questions': '',
            'transcripts': '',
            'answerKey': '',
            'explanation': '',
            'audio_firebase': '',
            'audio_cloudflare': item['objectUrl']
        })

folder_url = f'{public_base}/audio/listening/sets/{set_id}'
draft = {
    'id': set_id,
    'setId': set_id,
    'setDate': set_date,
    'testType': 'mocktest',
    'module': 'listening',
    'label': 'Listening',
    'difficulty': 'intermediate',
    'cloudflare_folder': folder_url,
    'updatedAt': datetime.utcnow().isoformat() + 'Z',
    '_updatedAt': datetime.utcnow().isoformat() + 'Z',
    'parts': parts
}

rd = requests.patch(rtdb_base + f'/toefl_itp/drafts_v2/{set_id}.json', json=draft, timeout=20)
ri = requests.put(rtdb_base + f'/toefl_itp/index_by_date/listening/{set_date}.json', json=set_id, timeout=20)
results['firebase_write'] = {'draft_status': rd.status_code, 'index_status': ri.status_code}

# 4) Verify test-page style resolution: date -> setId -> draft -> urls alive
idx = requests.get(rtdb_base + f'/toefl_itp/index_by_date/listening/{set_date}.json', timeout=20)
df = requests.get(rtdb_base + f'/toefl_itp/drafts_v2/{set_id}.json', timeout=20)
idx_val = idx.json()
df_val = df.json() or {}
parts_val = df_val.get('parts') or []
url_checks = []
for i in [1, 2, 3]:
    p = parts_val[i] if isinstance(parts_val, list) and len(parts_val) > i else None
    u = (p or {}).get('audio_cloudflare') if isinstance(p, dict) else None
    if u:
        h = requests.head(u, timeout=20, allow_redirects=True)
        url_checks.append({'part': i, 'url': u, 'status': h.status_code})
    else:
        url_checks.append({'part': i, 'url': None, 'status': None})

results['resolution_check'] = {
    'date': set_date,
    'set_id_expected': set_id,
    'set_id_from_index': idx_val,
    'index_matches': idx_val == set_id,
    'draft_fetch_status': df.status_code,
    'url_checks': url_checks
}

overall_ok = (
    results['ensure_audio_folder']['ok'] and
    all(x.get('keys_match') and x.get('put_status') == 200 and x.get('public_head_status') == 200 for x in uploaded if x.get('objectUrl')) and
    results['firebase_write']['draft_status'] == 200 and
    results['firebase_write']['index_status'] == 200 and
    results['resolution_check']['index_matches'] and
    all((x.get('status') == 200) for x in results['resolution_check']['url_checks'])
)
results['overall_ok'] = overall_ok

print(json.dumps(results, indent=2))
