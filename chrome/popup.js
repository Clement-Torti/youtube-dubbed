const style = document.createElement('style');
style.textContent = AD.SETTINGS_CSS;
document.head.appendChild(style);
AD.mountSettings(document.getElementById('settings'));

const statusEl = document.getElementById('status');
const mainBtn = document.getElementById('main');
let tabId = null;

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;
  let st = null;
  try { st = await chrome.tabs.sendMessage(tabId, { type: 'getStatus' }); } catch {}
  if (!st || !st.onVideo) {
    mainBtn.disabled = true;
    mainBtn.textContent = 'Dub this video';
    statusEl.textContent = st ? 'Open a YouTube video to start dubbing.' : 'Open (or reload) a YouTube video page to start dubbing.';
    statusEl.classList.remove('error');
    return;
  }
  const busy = st.state === 'loading' || st.state === 'dubbing';
  mainBtn.disabled = false;
  mainBtn.textContent = busy ? 'Dubbing… (Click to Stop)' : 'Dub this video';
  statusEl.textContent = st.message || '';
  statusEl.classList.toggle('error', st.state === 'error');
}

mainBtn.addEventListener('click', async () => {
  if (tabId == null) return;
  await chrome.tabs.sendMessage(tabId, { type: 'toggle' }).catch(() => {});
  setTimeout(refresh, 200);
});

refresh();
setInterval(refresh, 1000);
