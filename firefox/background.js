// Service worker: free translation (Google gtx) and free TTS
// (Microsoft Edge neural voices, falling back to Google Translate TTS).

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Google answers too many requests by redirecting to google.com/sorry (a captcha page).
const BLOCKED = 'Google Translate is temporarily blocking your connection (too many requests). It usually clears up within a few hours.';

// ---------------------------------------------------------------- translation

async function gtx(text, sl, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1&sl=${encodeURIComponent(sl || 'auto')}&tl=${encodeURIComponent(tl)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'q=' + encodeURIComponent(text),
      redirect: 'manual', // otherwise the block surfaces as an opaque "Failed to fetch"
    });
    if (res.type === 'opaqueredirect') throw new Error(BLOCKED);
    if (res.ok) {
      const data = await res.json();
      return (data.sentences || []).map(s => s.trans || '').join('');
    }
    if (attempt >= 3 || (res.status !== 429 && res.status < 500)) throw new Error(`Translate HTTP ${res.status}`);
    await sleep(1000 * 2 ** attempt);
  }
}

async function translateBatch({ texts, sl, tl }) {
  // One request for the whole batch (one line per segment) keeps context and avoids rate limits.
  try {
    const parts = (await gtx(texts.join('\n'), sl, tl)).split('\n');
    if (parts.length === texts.length) return { translations: parts.map(p => p.trim()) };
  } catch (e) {
    if (e.message === BLOCKED) throw e;
    console.warn('[AutoDub] batch translate failed, retrying per line', e);
  }
  const translations = [];
  for (const t of texts) translations.push((await gtx(t, sl, tl)).trim());
  return { translations };
}

// ---------------------------------------------------------------- Edge TTS

const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_VERSION = '1-143.0.3650.75';
let edgeFailures = 0;
let edgeDisabledUntil = 0;

async function secMsGec() {
  let secs = Math.floor(Date.now() / 1000) + 11644473600; // Windows epoch
  secs -= secs % 300;
  const data = new TextEncoder().encode(`${BigInt(secs) * 10000000n}${EDGE_TOKEN}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function buildSsml(text, voice, rate) {
  const locale = voice.split('-').slice(0, 2).join('-');
  // The voice speaks at exactly the user's chosen speed (default +0% = natural pace).
  const pct = Math.round((rate - 1) * 100);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'><prosody pitch='+0Hz' rate='${pct >= 0 ? '+' : ''}${pct}%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
}

const escapeXml = s => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

async function edgeTts(text, voice, rate) {
  const id = crypto.randomUUID().replaceAll('-', '');
  const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}&ConnectionId=${id}&Sec-MS-GEC=${await secMsGec()}&Sec-MS-GEC-Version=${EDGE_VERSION}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const chunks = [];
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (err) return reject(err);
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      if (!total) return reject(new Error('Edge TTS returned no audio'));
      const out = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.byteLength; }
      resolve(out.buffer);
    };
    const timer = setTimeout(() => finish(new Error('Edge TTS timeout')), 20000);

    ws.onopen = () => {
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');
      ws.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` + buildSsml(text, voice, rate));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        if (e.data.includes('Path:turn.end')) finish();
        return;
      }
      const view = new DataView(e.data);
      const headerLen = view.getUint16(0);
      const header = new TextDecoder().decode(new Uint8Array(e.data, 2, headerLen));
      if (header.includes('Path:audio')) {
        const audio = new Uint8Array(e.data, 2 + headerLen);
        if (audio.byteLength) chunks.push(audio.slice());
      }
    };
    ws.onerror = () => finish(new Error('Edge TTS connection error'));
    ws.onclose = () => finish(new Error('Edge TTS closed early'));
  });
}

// ---------------------------------------------------------------- Google TTS (fallback)

function splitForGoogle(text, max = 190) {
  const out = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = -1;
    for (const re of [/[.!?。！？؟]\s/g, /[,;:،，、]\s/g, /\s/g]) {
      let m;
      while ((m = re.exec(rest)) && m.index < max) cut = m.index + 1;
      if (cut > max / 3) break;
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function googleTts(text, lang) {
  const parts = splitForGoogle(text);
  const buffers = [];
  for (let i = 0; i < parts.length; i++) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}` +
      `&total=${parts.length}&idx=${i}&textlen=${parts[i].length}&q=${encodeURIComponent(parts[i])}`;
    // Error messages start with a code the page uses to pick the right wait and message:
    // NETWORK (can't reach Google), RATE_LIMITED (Google is throttling us), HTTP (anything else).
    let res;
    try {
      res = await fetch(url, { redirect: 'manual' }); // a throttling redirect would otherwise look like a network error
    } catch (e) {
      throw new Error(`NETWORK: can't reach the Google voice service (${navigator.onLine === false ? 'offline' : e.message})`);
    }
    if (res.type === 'opaqueredirect' || res.status === 429) throw new Error('RATE_LIMITED: Google is limiting voice requests');
    if (!res.ok) throw new Error(`HTTP: Google voice returned HTTP ${res.status}`);
    buffers.push(await res.arrayBuffer());
  }
  return buffers;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function tts({ text, voice, lang, rate = 1 }) {
  if (Date.now() > edgeDisabledUntil) {
    try {
      const audio = await edgeTts(text, voice, rate);
      edgeFailures = 0;
      return { provider: 'edge', chunks: [toBase64(audio)] };
    } catch (e) {
      console.warn('[AutoDub] Edge TTS failed', e);
      // Rejections (HTTP 403) are persistent: stop retrying for a while to avoid slow, noisy failures.
      if (++edgeFailures >= 2) edgeDisabledUntil = Date.now() + 60 * 60 * 1000;
    }
  }
  const buffers = await googleTts(text, lang);
  return { provider: 'google', chunks: buffers.map(toBase64) };
}

// ---------------------------------------------------------------- messaging

const handlers = { translate: translateBatch, tts };

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;
  handler(msg).then(
    result => sendResponse({ ok: true, ...result }),
    err => sendResponse({ ok: false, error: String((err && err.message) || err) }),
  );
  return true;
});
