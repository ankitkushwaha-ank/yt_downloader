/* Helpers */
const qs = s => document.querySelector(s);
const urlInput = qs('#urlInput');
const fetchBtn = qs('#fetchBtn');
const loadingBar = qs('#loadingBar');
const loadingFill = qs('#loadingFill');
const infoCard = qs('#infoCard');
const thumbImg = qs('#thumbImg');
const titleEl = qs('#title');
const uploaderEl = qs('#uploader');
const detailsEl = qs('#details');
const descEl = qs('#description');
const formatSelect = qs('#formatSelect');
const sizeInfo = qs('#sizeInfo');
const downloadBtn = qs('#downloadBtn');
const infoMsg = qs('#infoMsg');

let loadingTicker = null;
let cachedInfo = null;

function humanBytes(bytes) {
  if (!bytes) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = Number(bytes) || 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(2) + ' ' + units[i];
}

function startLoading() {
  if (!loadingBar || !loadingFill) return;
  loadingBar.style.display = 'block';
  let percent = 6;
  loadingFill.style.width = percent + '%';
  loadingTicker = setInterval(() => {
    percent = Math.min(96, percent + Math.random() * 3);
    loadingFill.style.width = percent + '%';
  }, 220);
}

function stopLoading() {
  if (loadingTicker) clearInterval(loadingTicker);
  if (loadingFill) loadingFill.style.width = '100%';
  setTimeout(() => {
    if (loadingBar) loadingBar.style.display = 'none';
    if (loadingFill) loadingFill.style.width = '0%';
  }, 400);
}

/* Fetch metadata */
fetchBtn.addEventListener('click', async () => {
  const url = (urlInput.value || '').trim();
  if (!url) { alert('Paste a YouTube URL first'); urlInput.focus(); return; }

  infoCard.classList.add('hidden');
  downloadBtn.disabled = true;
  infoMsg.textContent = '';
  startLoading();

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error(await res.text());
    const info = await res.json();
    cachedInfo = info;

    thumbImg.src = info.thumbnail || '';
    titleEl.textContent = info.title || 'Untitled';
    uploaderEl.textContent = info.uploader ? `By ${info.uploader}` : '';
    detailsEl.textContent = `${info.duration ? Math.round(info.duration/60) + ' min' : '—'} • ${info.view_count || '—'} views`;
    if (descEl) descEl.textContent = info.description ? info.description.slice(0,400) + (info.description.length>400 ? '…' : '') : '';

    // Populate formats
    formatSelect.innerHTML = '';
    (info.formats || []).forEach(f => {
      if (!f.format_id) return;
      const q = f.resolution || f.format || 'unknown';
      const label = `${q} • ${f.ext || ''} • ${humanBytes(f.filesize)}`;
      const opt = document.createElement('option');
      opt.value = f.format_id;
      opt.textContent = label;
      opt.dataset.filesize = f.filesize || '';
      opt.dataset.resolution = f.resolution || q;
      formatSelect.appendChild(opt);
    });

    if (formatSelect.options.length === 0) {
      infoMsg.textContent = 'No formats available.';
      downloadBtn.disabled = true;
    } else {
      downloadBtn.disabled = false;
      const firstFs = formatSelect.options[0].dataset.filesize;
      sizeInfo.textContent = firstFs ? `Approx size: ${humanBytes(Number(firstFs))}` : 'Size: Unknown';
    }

    stopLoading();
    setTimeout(() => infoCard.classList.remove('hidden'), 120);

  } catch (err) {
    stopLoading();
    infoMsg.textContent = 'Error: ' + (err.message || err);
    console.error(err);
    alert('Error fetching video info: ' + (err.message || err));
  }
});

/* Update size when quality changes */
formatSelect.addEventListener('change', () => {
  const opt = formatSelect.selectedOptions[0];
  sizeInfo.textContent = opt?.dataset.filesize ? `Approx size: ${humanBytes(Number(opt.dataset.filesize))}` : 'Size: Unknown';
});

/* Start download with progress */
downloadBtn.addEventListener('click', async () => {
  const url = (urlInput.value || '').trim();
  const format_id = formatSelect.value;
  const resolution = formatSelect.selectedOptions[0]?.dataset.resolution || 'unknown';
  if (!format_id) { alert('Choose a format'); return; }

  const safeTitle = (cachedInfo?.title || 'video').replace(/[^a-z0-9_\-]+/gi, '_').slice(0,50);
  const clientFilename = `${safeTitle}_${resolution}_ytdlank.mp4`;

  downloadBtn.disabled = true;
  infoMsg.textContent = 'Starting download...';

  try {
    // Step 1: Start download and get session_id
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ url, format_id, filename: clientFilename, title: cachedInfo?.title })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `Server returned ${res.status}`);
    }
    const data = await res.json();
    if (!data.session_id) throw new Error('No session ID received');

    const sessionId = data.session_id;

    // Step 2: Listen for progress updates via EventSource
    await new Promise((resolve, reject) => {
      const source = new EventSource(`/api/progress?session=${sessionId}`);

      source.onmessage = e => {
        try {
          const payload = JSON.parse(e.data);

          if (payload.status === 'downloading') {
            const percent = payload.total_bytes > 0
              ? Math.round((payload.downloaded_bytes / payload.total_bytes) * 100)
              : null;
            infoMsg.textContent = percent !== null
              ? `Downloading... ${percent}%`
              : `Downloading... ${humanBytes(payload.downloaded_bytes)}`;
          } else if (payload.status === 'finished' && payload.download_url) {
            infoMsg.textContent = 'Download complete';

            // Trigger browser download
            const a = document.createElement('a');
            a.href = payload.download_url;
            a.download = clientFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            source.close();
            resolve();
          } else if (payload.status === 'error') {
            infoMsg.textContent = `Error: ${payload.error || 'Unknown error'}`;
            source.close();
            reject(new Error(payload.error || 'Download error'));
          }
        } catch (err) {
          source.close();
          reject(err);
        }
      };

      source.onerror = err => {
        source.close();
        reject(new Error('Connection lost or server error'));
      };
    });

  } catch (err) {
    infoMsg.textContent = 'Download failed: ' + (err.message || err);
    alert('Download failed: ' + (err.message || err));
  } finally {
    downloadBtn.disabled = false;
  }
});
