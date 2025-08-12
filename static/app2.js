/* Frontend: fetch video info and show loading animation while waiting.
   Works with backend endpoints:
   POST /api/info  -> { title, uploader, duration, view_count, description, thumbnail, formats: [{format_id, ext, resolution, fps, filesize}] }
   POST /api/download -> { session_id }
*/

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

let spinnerTimer = null;
let percent = 0;
let loadingTicker = null;
let cachedInfo = null;

function humanBytes(bytes){
  if(!bytes) return 'Unknown';
  const units=['B','KB','MB','GB','TB'];
  let i=0;
  while(bytes>=1024 && i<units.length-1){ bytes/=1024; i++; }
  return bytes.toFixed(2) + ' ' + units[i];
}

/* animate loading bar while waiting for the response */
function startLoading() {
  loadingBar.style.display = 'block';
  percent = 6 + Math.random()*6; // start small
  loadingFill.style.width = percent + '%';
  loadingTicker = setInterval(()=> {
    // increase quickly at first, slow down as it grows
    const inc = 0.6 + Math.random()*1.6;
    percent = Math.min(96, percent + inc * (1 - percent/100));
    loadingFill.style.width = percent + '%';
  }, 220);
}

function stopLoading() {
  clearInterval(loadingTicker);
  loadingTicker = null;
  loadingFill.style.width = '100%';
  setTimeout(()=>{
    loadingBar.style.display = 'none';
    loadingFill.style.width = '0%';
  }, 450);
}

/* fetch metadata */
fetchBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if(!url){ alert('Paste a YouTube URL first'); urlInput.focus(); return; }

  // UI preps
  infoCard.classList.add('hidden');
  downloadBtn.disabled = true;
  infoMsg.textContent = '';
  startLoading();

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url})
    });

    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || 'Failed to fetch info');
    }
    const info = await res.json();
    cachedInfo = info;
    // configure UI with info
    thumbImg.src = info.thumbnail || '';
    titleEl.textContent = info.title || 'Untitled';
    uploaderEl.textContent = info.uploader ? ('By ' + info.uploader) : '';
    detailsEl.textContent = `${info.duration ? Math.round(info.duration/60) + ' min' : '—'} • ${info.view_count || '—'} views`;
    descEl.textContent = info.description ? info.description.slice(0,400) + (info.description.length>400 ? '…' : '') : '';

    // formats -> populate select, filter and sort readable options
    formatSelect.innerHTML = '';
    const unique = [];
    (info.formats || []).forEach(f => {
      // only show formats with an id and ext
      if(!f.format_id) return;
      // create label like "1080p • mp4 • 40 MB"
      const label = `${f.resolution || 'audio'} ${f.fps ? '• ' + f.fps + 'fps' : ''} • ${f.ext || ''} • ${humanBytes(f.filesize)}`;
      // avoid duplicates by format_id
      if(unique.indexOf(f.format_id) === -1){
        unique.push(f.format_id);
        const opt = document.createElement('option');
        opt.value = f.format_id;
        opt.textContent = label;
        // attach filesize metadata
        opt.dataset.filesize = f.filesize || '';
        formatSelect.appendChild(opt);
      }
    });

    // if no formats -> show message
    if(formatSelect.options.length === 0){
      infoMsg.textContent = 'No downloadable formats available.';
      downloadBtn.disabled = true;
    } else {
      // enable download & show size info for first option
      downloadBtn.disabled = false;
      const firstFilesize = formatSelect.options[0].dataset.filesize;
      sizeInfo.textContent = firstFilesize ? `Approx size: ${humanBytes(Number(firstFilesize))}` : 'Size: Unknown';
    }

    // show card
    stopLoading();
    setTimeout(()=> infoCard.classList.remove('hidden'), 120);
  } catch (err){
    stopLoading();
    infoMsg.textContent = 'Error: ' + (err.message || err);
    console.error(err);
    alert('Error fetching video info: ' + (err.message || err));
  }
});

/* update size info when user picks different quality */
formatSelect.addEventListener('change', () => {
  const opt = formatSelect.selectedOptions[0];
  if(!opt){ sizeInfo.textContent = ''; return; }
  const fs = opt.dataset.filesize;
  sizeInfo.textContent = fs ? `Approx size: ${humanBytes(Number(fs))}` : 'Size: Unknown';
});

/* start download: POST /api/download and show session id (download progress not handled here) */
downloadBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const format_id = formatSelect.value;
  if(!format_id){ alert('Choose a format'); return; }
  downloadBtn.disabled = true;
  infoMsg.textContent = 'Starting download...';

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url, format_id})
    });
    if(!res.ok) throw new Error(await res.text());
    const data = await res.json();
    infoMsg.textContent = 'Download started — session: ' + (data.session_id || 'n/a') + '. Check server downloads folder.';
    // optionally connect to SSE /api/progress?session=... to show live progress (implemented in the backend)
  } catch (err) {
    infoMsg.textContent = 'Start failed: ' + (err.message || err);
    alert('Failed to start download: ' + (err.message || err));
  } finally {
    downloadBtn.disabled = false;
  }
});
