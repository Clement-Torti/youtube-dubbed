// Runs in the page (MAIN world). Gives the content script access to the
// YouTube player API and fetches caption tracks with the player's own
// proof-of-origin token, which YouTube now requires for /api/timedtext.
(() => {
  const TAG = '__autodub__';
  const origFetch = window.fetch;
  let lastTimedtext = null;

  const record = (u) => {
    try {
      if (u && String(u).includes('/api/timedtext')) lastTimedtext = new URL(String(u), location.href);
    } catch {}
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    record(url);
    return origOpen.apply(this, arguments);
  };
  window.fetch = function (input) {
    record(typeof input === 'string' ? input : input && input.url);
    return origFetch.apply(this, arguments);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const player = () => document.getElementById('movie_player');
  const looksValid = t => typeof t === 'string' && t.trim().startsWith('{') && t.includes('events');
  const get = url => origFetch(url.toString(), { credentials: 'include' }).then(r => (r.ok ? r.text() : ''));

  // Make the player request captions itself so we can reuse its token.
  async function captureTimedtext(videoId, languageCode) {
    const fresh = () => lastTimedtext && lastTimedtext.searchParams.get('v') === videoId && lastTimedtext.searchParams.has('pot');
    if (fresh()) return lastTimedtext;
    const wait = async () => { for (let i = 0; i < 40 && !fresh(); i++) await sleep(100); };
    const btn = document.querySelector('#movie_player .ytp-subtitles-button');
    if (btn) {
      const wasOn = btn.getAttribute('aria-pressed') === 'true';
      if (wasOn) { btn.click(); await sleep(150); }
      btn.click();
      await wait();
      if (!wasOn && btn.getAttribute('aria-pressed') === 'true') btn.click();
    } else {
      // Mobile player: no subtitles button in the control bar, use the player API instead.
      const p = player();
      if (!p || !p.setOption) return null;
      let before = null;
      try { before = p.getOption('captions', 'track'); } catch {}
      try { p.loadModule('captions'); } catch {}
      try { p.setOption('captions', 'track', { languageCode }); } catch {}
      await wait();
      try { if (!before || !before.languageCode) p.setOption('captions', 'track', {}); } catch {}
    }
    return fresh() ? lastTimedtext : null;
  }

  const handlers = {
    getInfo() {
      const p = player();
      let r = p && p.getPlayerResponse && p.getPlayerResponse();
      // Mobile site fallback: the initial response embedded in the page.
      const initial = window.ytInitialPlayerResponse;
      if (!r && initial && initial.videoDetails && initial.videoDetails.videoId === new URLSearchParams(location.search).get('v')) r = initial;
      const list = r && r.captions && r.captions.playerCaptionsTracklistRenderer;
      return {
        videoId: r && r.videoDetails && r.videoDetails.videoId,
        tracks: ((list && list.captionTracks) || []).map(t => ({
          baseUrl: t.baseUrl,
          languageCode: t.languageCode,
          kind: t.kind || '',
          name: (t.name && (t.name.simpleText || (t.name.runs || []).map(x => x.text).join(''))) || t.languageCode,
        })),
        // Languages YouTube can auto-translate the captions into.
        translationLanguages: ((list && list.translationLanguages) || []).map(l => l.languageCode),
      };
    },

    // tlang: ask YouTube for the captions already translated into that language.
    async getCaptions({ track, videoId, tlang }) {
      const url = new URL(track.baseUrl, location.origin);
      url.searchParams.set('fmt', 'json3');
      if (tlang) url.searchParams.set('tlang', tlang);
      let text = await get(url);
      if (looksValid(text)) return text;
      console.info('[AutoDub] captions: direct request returned nothing (' + (text ? text.length : 0) + ' bytes), using the player token');

      const captured = await captureTimedtext(videoId, track.languageCode);
      if (!captured) {
        console.error('[AutoDub] captions: the player never requested captions, so no token could be borrowed');
        throw new Error('Could not get a caption token from the player');
      }
      for (const [k, v] of captured.searchParams) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
      if (tlang) url.searchParams.set('tlang', tlang);
      else url.searchParams.delete('tlang');
      url.searchParams.set('fmt', 'json3');
      text = await get(url);
      if (looksValid(text)) return text;
      console.error('[AutoDub] captions: still empty with the player token (' + (text ? text.length : 0) + ' bytes)',
        { lang: track.languageCode, kind: track.kind, tlang: tlang || null });
      throw new Error('YouTube returned empty captions');
    },
  };

  window.addEventListener('message', async (e) => {
    // No e.source check: Firefox wraps windows between the page and content scripts.
    if (!e.data || e.data[TAG] !== 'req') return;
    const { id, cmd, args } = e.data;
    const reply = payload => window.postMessage({ [TAG]: 'res', id, ...payload }, '*');
    try {
      reply({ result: await handlers[cmd](args || {}) });
    } catch (err) {
      reply({ error: String((err && err.message) || err) });
    }
  });
})();
