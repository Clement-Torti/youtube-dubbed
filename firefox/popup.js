const style = document.createElement('style');
style.textContent = AD.SETTINGS_CSS;
document.head.appendChild(style);
AD.mountSettings(document.getElementById('settings'));

// Firefox treats host permissions as opt-in: without them the extension can't run on YouTube.
const ORIGINS = browser.runtime.getManifest().host_permissions;
const grantBtn = document.getElementById('grant');
async function checkPermissions() {
  const ok = await browser.permissions.contains({ origins: ORIGINS });
  grantBtn.hidden = ok;
  return ok;
}
grantBtn.addEventListener('click', async () => {
  await browser.permissions.request({ origins: ORIGINS });
  if (await checkPermissions()) statusEl.textContent = 'Access granted. Reload the YouTube page.';
});
checkPermissions();

const statusEl = document.getElementById('status');
const mainBtn = document.getElementById('main');
let tabId = null;

async function refresh() {
  // On Android the popup may open as its own tab, so look for the YouTube tab explicitly.
  const tabs = await browser.tabs.query({ url: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
  const tab = tabs.find(t => t.active) || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  tabId = tab && tab.id;
  let st = null;
  try { st = await browser.tabs.sendMessage(tabId, { type: 'getStatus' }); } catch {}
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
  await browser.tabs.sendMessage(tabId, { type: 'toggle' }).catch(() => {});
  setTimeout(refresh, 200);
});

refresh();
setInterval(refresh, 1000);
