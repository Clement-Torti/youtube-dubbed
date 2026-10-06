// Glue: loads captions for the current video and drives the Dubber.
(() => {
  const AD = globalThis.AD;
  const TAG = '__autodub__';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let settings = null;
  let dubber = null;
  let session = 0;          // bumps on every start/stop so stale async work is dropped
  let lastVideoId = null;

  // Ask the page-world script (page-hook.js) to run a command.
  function page(cmd, args, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const onMsg = e => {
        if (e.source !== window || !e.data || e.data[TAG] !== 'res' || e.data.id !== id) return;
        cleanup();
        e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Page script timeout')); }, timeout);
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMsg); };
      window.addEventListener('message', onMsg);
      window.postMessage({ [TAG]: 'req', id, cmd, args }, '*');
    });
  }

  const currentVideoId = () => new URLSearchParams(location.search).get('v');
  // Main language code, with YouTube's legacy codes mapped to ours (iw = Hebrew, in = Indonesian).
  const baseLang = c => {
    const base = (c || '').split('-')[0].toLowerCase();
    return { iw: 'he', in: 'id', ji: 'yi' }[base] || base;
  };

  // YouTube's code for our target language, if it offers auto-translation into it.
  function youtubeLangCode(available, target) {
    const aliases = { 'zh-CN': ['zh-Hans', 'zh-CN'], 'zh-TW': ['zh-Hant', 'zh-TW'], he: ['iw', 'he'] };
    for (const want of aliases[target] || [target]) {
      const hit = available.find(c => c.toLowerCase() === want.toLowerCase());
      if (hit) return hit;
    }
    return available.find(c => baseLang(c) === baseLang(target)) || null;
  }

  // Report any error thrown by the extension's own code (not YouTube's).
  const ours = x => /(chrome|moz)-extension:\/\//.test(String((x && (x.stack || x.filename)) || ''));
  window.addEventListener('error', e => { if (ours(e) || ours(e.error)) AD.log.error('uncaught error:', e.error || e.message); });
  window.addEventListener('unhandledrejection', e => { if (ours(e.reason)) AD.log.error('unhandled error:', e.reason); });

  function setStatus(state, message) {
    if (state === 'error' && message) AD.log.error(message);
    AD.ui.setStatus(state, message);
    AD.ui.applySettings(settings);
  }

  async function start() {
    stop();
    const my = ++session;
    const videoId = currentVideoId();
    if (!videoId) return setStatus('error', 'Open a YouTube video first');
    setStatus('loading', 'Loading subtitles…');

    try {
      let info = null;
      for (let i = 0; i < 30; i++) {
        info = await page('getInfo');
        if (info && info.videoId === videoId) break;
        await sleep(300);
      }
      if (my !== session) return;
      if (!info || info.videoId !== videoId) throw new Error('Could not read the video player');
      if (!info.tracks.length) throw new Error('This video has no subtitles to dub');

      AD.log.info(`video ${videoId}: subtitle tracks ${info.tracks.map(t => t.languageCode + (t.kind === 'asr' ? ' (auto)' : '')).join(', ') || 'none'}`);
      const track = AD.pickTrack(info.tracks, settings.lang);
      AD.log.info(`using subtitles: ${track.name} [${track.languageCode}${track.kind ? ', ' + track.kind : ''}]`);
      const spoken = (info.tracks.find(t => t.kind === 'asr') || track).languageCode;
      if (baseLang(spoken) === baseLang(settings.lang) && baseLang(track.languageCode) === baseLang(settings.lang)) {
        throw new Error('This video is already in the selected language');
      }

      let needTranslate = baseLang(track.languageCode) !== baseLang(settings.lang);
      let json = null;
      let translatedBy = '';
      if (needTranslate && settings.translator !== 'google') {
        // Let YouTube translate the captions (one request to youtube.com, no Google Translate quota).
        const tlang = youtubeLangCode(info.translationLanguages || [], settings.lang);
        if (tlang) {
          try {
            json = JSON.parse(await page('getCaptions', { track, videoId, tlang }, 20000));
            needTranslate = false;
            translatedBy = ', translated by YouTube';
          } catch (e) {
            AD.log.warn('YouTube translation unavailable, falling back to Google Translate', e);
          }
        }
      }
      if (my !== session) return;
      if (!json) json = JSON.parse(await page('getCaptions', { track, videoId }, 20000));
      if (my !== session) return;
      const segments = AD.buildSegments(AD.parseJson3(json));
      AD.log.info(`subtitles loaded${translatedBy}: ${segments.length} lines` +
        (segments.length ? `, from ${segments[0].start.toFixed(1)}s to ${segments[segments.length - 1].end.toFixed(1)}s` : ''));
      if (!segments.length) throw new Error('The subtitles are empty');

      const video = document.querySelector('#movie_player video.html5-main-video') || document.querySelector('#movie_player video');
      if (!video) throw new Error('Video element not found');

      dubber = new AD.Dubber({
        video,
        segments,
        sourceLang: track.languageCode,
        needTranslate,
        settings,
        onStatus: (state, msg) => { if (my === session) setStatus(state, msg); },
        onSubtitle: text => { if (my === session) AD.ui.showSubtitle(text); },
        isHovering: () => AD.ui.isHovering(),
        onWait: message => { if (my === session) AD.ui.showWait(message); },
        onFatal: msg => { if (my === session) { stop(); setStatus('error', msg); } },
      });
      dubber.start();
      setStatus('dubbing', `Dubbing from ${track.name}${translatedBy}…`);
    } catch (e) {
      if (my !== session) return;
      stop();
      setStatus('error', e.message);
    }
  }

  function stop() {
    session++;
    if (dubber) { dubber.stop(); dubber = null; }
    AD.ui.clearSubtitle();
    AD.ui.showWait(null);
    setStatus('idle', '');
  }

  const isBusy = () => AD.ui.state === 'loading' || AD.ui.state === 'dubbing';
  const toggle = () => (isBusy() ? stop() : start());

  function onNavigate() {
    const id = currentVideoId();
    if (id === lastVideoId) return;
    lastVideoId = id;
    stop();
    if (id) setTimeout(() => { if (currentVideoId() === id && !isBusy()) autoDub(id); }, 800);
  }

  // The video's original language: its ".4" audio track when it has several, else the language of
  // YouTube's auto-generated captions (made from the original audio), else its only subtitle track.
  function originalLanguage(info) {
    if (info.originalAudioLang) return { lang: info.originalAudioLang, from: 'original audio track' };
    const asr = info.tracks.find(t => t.kind === 'asr');
    if (asr) return { lang: asr.languageCode, from: 'auto-generated captions' };
    if (info.tracks.length === 1) return { lang: info.tracks[0].languageCode, from: 'only subtitle track' };
    return null;
  }

  // Automatic dubbing rules: original language in the rules, has subtitles, and YouTube has no audio
  // track in the dubbing language (then the viewer can just pick YouTube's audio instead).
  async function autoDub(videoId) {
    const rules = settings.autoRules || [];
    if (!rules.length) return;
    let info = null;
    for (let i = 0; i < 30 && currentVideoId() === videoId; i++) {
      info = await page('getInfo').catch(() => null);
      if (info && info.videoId === videoId) break;
      await sleep(300);
    }
    if (currentVideoId() !== videoId || isBusy() || !info || info.videoId !== videoId) return;

    const name = AD.getLanguage(settings.lang).name;
    const skip = reason => {
      AD.log.info('automatic dubbing skipped: ' + reason);
      AD.ui.setStatus('idle', 'Automatic dubbing skipped: ' + reason + '.');
    };
    if (!info.tracks.length) return skip('this video has no subtitles');
    const original = originalLanguage(info);
    if (!original) return skip("the video's original language is unknown");
    const lang = baseLang(original.lang);
    if (lang === baseLang(settings.lang)) return skip(`the video is already in ${name}`);
    if (!rules.includes('*') && !rules.some(r => baseLang(r) === lang)) return skip(`no rule for its original language (${original.lang})`);
    if ((info.audioLangs || []).some(l => baseLang(l) === baseLang(settings.lang))) return skip(`YouTube already offers ${name} audio for this video`);

    AD.log.info(`automatic dubbing: original language ${original.lang} (from the ${original.from}), no ${name} audio track`);
    start();
  }

  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== 'local') return;
    const prev = settings;
    settings = await AD.loadSettings();
    AD.ui.applySettings(settings);
    if (!dubber) return;
    // Language or mode change needs fresh translations: restart at the current position.
    if (prev.lang !== settings.lang || prev.dubbing !== settings.dubbing || prev.translator !== settings.translator) start();
    else dubber.applySettings(settings);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'toggle') { toggle(); sendResponse({ ok: true }); }
    else if (msg.type === 'getStatus') sendResponse({ state: AD.ui.state, message: AD.ui.message, onVideo: !!currentVideoId() });
  });

  (async () => {
    settings = await AD.loadSettings();
    AD.ui.init({ onToggle: toggle, onRetry: () => { if (dubber) dubber.retryNow(); } });
    AD.ui.applySettings(settings);
    document.addEventListener('yt-navigate-finish', onNavigate);
    onNavigate();
  })();
})();
