import os
import re
import threading
import time
import uuid
import json
from flask import Flask, request, jsonify, send_from_directory, render_template, Response, stream_with_context
from flask_cors import CORS
import yt_dlp

BASE_DIR = os.path.dirname(__file__)
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

sessions = {}
sessions_lock = threading.Lock()

def update_session(session_id, **kwargs):
    with sessions_lock:
        if session_id not in sessions:
            sessions[session_id] = {}
        sessions[session_id].update(kwargs)

def sanitize_filename(name: str) -> str:
    if not name:
        return "video"
    name = name.replace("\x00", "")
    name = re.sub(r"[^A-Za-z0-9 ._\-()\[\]]+", "_", name)
    name = re.sub(r"_+", "_", name)
    return name.strip()[:200]

def schedule_delete(path: str, delay: int = 300):
    def _worker(p, d):
        try:
            time.sleep(d)
            if os.path.isfile(p):
                os.remove(p)
        except Exception:
            pass
    threading.Thread(target=_worker, args=(path, delay), daemon=True).start()

def make_progress_hook(session_id):
    def hook(d):
        try:
            status = d.get('status')
            if status == 'downloading':
                downloaded = d.get('downloaded_bytes') or d.get('downloaded') or 0
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                speed = d.get('speed') or 0
                update_session(session_id,
                               status='downloading',
                               downloaded_bytes=int(downloaded),
                               total_bytes=int(total),
                               speed=float(speed))
            elif status == 'finished':
                filename = d.get('filename') or d.get('info_dict', {}).get('title')
                if filename:
                    filename = os.path.basename(filename)
                update_session(session_id,
                               status='finished',
                               downloaded_bytes=d.get('total_bytes', d.get('downloaded_bytes', 0)),
                               total_bytes=d.get('total_bytes', 0),
                               speed=0,
                               filename=filename)
        except Exception as e:
            update_session(session_id, status='error', error=str(e))
    return hook

def download_worker(session_id, url, format_id, outtmpl):
    try:
        update_session(session_id, status='starting', downloaded_bytes=0, total_bytes=0, speed=0)
        ydl_opts = {
            'format': f'{format_id}+bestaudio/best',
            'outtmpl': outtmpl,
            'merge_output_format': 'mp4',
            'progress_hooks': [make_progress_hook(session_id)],
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filepath = ydl.prepare_filename(info)

        # If merge output extension is not .mp4, check for .mp4 file
        if not filepath.lower().endswith('.mp4'):
            mp4_path = os.path.splitext(filepath)[0] + '.mp4'
            if os.path.exists(mp4_path):
                filepath = mp4_path

        if os.path.isfile(filepath):
            filename_only = os.path.basename(filepath)
            update_session(session_id, status='finished', filename=filename_only)
            schedule_delete(filepath, delay=300)
        else:
            update_session(session_id, status='error', error='Output file not found after download.')
    except Exception as e:
        update_session(session_id, status='error', error=str(e))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/info', methods=['POST'])
def api_info():
    data = request.get_json() or {}
    url = data.get('url')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    try:
        ydl_opts = {'quiet': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = []
        for f in info.get('formats', []):
            filesize = f.get('filesize') or f.get('filesize_approx') or 0
            formats.append({
                'format_id': f.get('format_id'),
                'format': f.get('format'),
                'ext': f.get('ext'),
                'resolution': f.get('resolution') or (f.get('height') and f"{f.get('height')}p"),
                'fps': f.get('fps'),
                'filesize': filesize,
                'vcodec': f.get('vcodec'),
                'acodec': f.get('acodec'),
            })

        return jsonify({
            'id': info.get('id'),
            'title': info.get('title'),
            'uploader': info.get('uploader'),
            'duration': info.get('duration'),
            'view_count': info.get('view_count'),
            'description': info.get('description'),
            'thumbnail': info.get('thumbnail'),
            'formats': formats,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def api_download():
    data = request.get_json() or {}
    url = data.get('url')
    format_id = data.get('format_id')
    requested_filename = data.get('filename')
    title_from_client = data.get('title')

    if not url or not format_id:
        return jsonify({'error': 'Missing url or format_id'}), 400

    if requested_filename:
        safe = sanitize_filename(os.path.basename(requested_filename))
        if os.path.splitext(safe)[1]:
            outtmpl = os.path.join(DOWNLOADS_DIR, safe)
        else:
            outtmpl = os.path.join(DOWNLOADS_DIR, safe + '.%(ext)s')
    else:
        base = sanitize_filename(title_from_client or f'video_{uuid.uuid4().hex[:8]}')
        outtmpl = os.path.join(DOWNLOADS_DIR, base + '.%(ext)s')

    session_id = str(uuid.uuid4())
    update_session(session_id, status='queued', downloaded_bytes=0, total_bytes=0, speed=0)

    t = threading.Thread(target=download_worker, args=(session_id, url, format_id, outtmpl), daemon=True)
    t.start()

    return jsonify({'session_id': session_id})

@app.route('/api/progress')
def api_progress():
    session = request.args.get('session')
    if not session:
        return jsonify({'error': 'session query param required'}), 400

    def gen(sess):
        while True:
            with sessions_lock:
                data = sessions.get(sess, {}).copy()
            if not data:
                payload = {'status': 'unknown'}
            else:
                payload = data.copy()
                if payload.get('status') == 'finished' and payload.get('filename'):
                    payload['download_url'] = f"/download/{payload['filename']}"

            # <-- FIX: Use json.dumps() for SSE JSON payload
            yield f"data: {json.dumps(payload)}\n\n"

            if payload.get('status') in ('finished', 'error'):
                break
            time.sleep(0.8)

    return Response(stream_with_context(gen(session)), mimetype='text/event-stream')

@app.route('/download/<path:filename>')
def serve_download(filename):
    safe_name = os.path.basename(filename)
    file_path = os.path.join(DOWNLOADS_DIR, safe_name)
    if not os.path.isfile(file_path):
        return jsonify({'error': 'File not found'}), 404
    return send_from_directory(DOWNLOADS_DIR, safe_name, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
