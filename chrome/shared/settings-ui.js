// Settings form shared by the in-player panel and the toolbar popup.
var AD = globalThis.AD || (globalThis.AD = {});

AD.SETTINGS_CSS = `
  :host, .ad-root { --pink: #f472b6; --bg: #1f1f1f; --field: #2a2a2a; --line: #3d3d3d; --text: #f1f1f1; --muted: #a8a8a8; }
  .ad-root { font: 13px/1.35 Roboto, "Segoe UI", Arial, sans-serif; color: var(--text); }
  .ad-row { margin-bottom: 10px; }
  .ad-label { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
  .ad-root select { width: 100%; box-sizing: border-box; background: var(--field); color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 7px 10px; font: inherit; cursor: pointer; }
  .ad-root select:focus { outline: 1px solid var(--pink); }
  .ad-root input[type=range] { width: 100%; accent-color: var(--pink); margin: 2px 0; }
  .ad-help { color: var(--muted); font-size: 11px; margin-top: 4px; }
  .ad-root details { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 4px; }
  .ad-root summary { cursor: pointer; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
  .ad-links { display: flex; justify-content: space-between; margin-top: 4px; }
  .ad-link { background: none; border: 0; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
  .ad-link:hover { color: var(--text); text-decoration: underline; }
  .ad-hidden { display: none !important; }
  .ad-stepper { display: flex; align-items: center; gap: 8px; }
  .ad-stepper button { width: 32px; height: 30px; border-radius: 6px; border: 1px solid var(--line); background: var(--field);
    color: var(--text); font: 500 16px Roboto, Arial, sans-serif; cursor: pointer; }
  .ad-stepper button:hover { border-color: var(--pink); }
  .ad-stepper output { flex: 1; text-align: center; background: var(--field); border: 1px solid var(--line); border-radius: 6px;
    padding: 6px 0; font-variant-numeric: tabular-nums; }
`;

AD.mountSettings = function (container) {
  const langOptions = AD.LANGUAGES.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  const rateOptions = [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(r => `<option value="${r}">${r === 1 ? 'Never slow down (pause instead)' : r + 'x'}</option>`).join('');
  container.innerHTML = AD.html(`
    <div class="ad-root">
      <div class="ad-row"><div class="ad-label">Dubbing language</div><select data-k="lang">${langOptions}</select></div>
      <div class="ad-row"><div class="ad-label">Dubbing</div>
        <select data-k="dubbing"><option value="on">On</option><option value="off">Off (translated subtitles only)</option></select></div>
      <div class="ad-row" data-when="dub"><div class="ad-label">Voice</div><select data-k="voice"></select></div>
      <div class="ad-row" data-when="dub"><div class="ad-label">Voice speed</div>
        <div class="ad-stepper"><button data-action="rate-down" title="-0.05x">−</button><output data-out="dubRate"></output><button data-action="rate-up" title="+0.05x">+</button></div>
        <div class="ad-help">The voice always speaks at exactly this speed. The video adapts its own speed to stay in sync.</div></div>
      <div class="ad-row" data-when="dub"><div class="ad-label"><span>Dubbing volume</span><span data-out="dubVolume"></span></div>
        <input type="range" min="0" max="100" data-k="dubVolume"></div>
      <div class="ad-row" data-when="dub"><div class="ad-label">Original audio</div>
        <select data-k="originalMode">
          <option value="duck">Lower while dubbing (default)</option>
          <option value="mute">Mute</option>
          <option value="keep">Keep</option>
        </select></div>
      <div class="ad-row" data-when="duck"><div class="ad-label"><span>Lower to</span><span data-out="duckLevel"></span></div>
        <input type="range" min="0" max="50" data-k="duckLevel"></div>
      <div class="ad-row"><div class="ad-label">Translated subtitles</div>
        <select data-k="subtitles">
          <option value="above">Show alongside YouTube captions</option>
          <option value="replace">Replace YouTube captions</option>
          <option value="off">Don't show</option>
        </select></div>
      <div class="ad-row" data-when="subs"><div class="ad-label">Subtitle position</div>
        <select data-k="subtitlePosition">
          <option value="bottom">Bottom</option>
          <option value="middle">Middle</option>
          <option value="top">Top</option>
        </select></div>
      <details>
        <summary>More settings</summary>
        <div class="ad-row" data-when="dub"><div class="ad-label">Slowest video speed</div>
          <select data-k="minRate">${rateOptions}</select>
          <div class="ad-help">The voice always plays at its natural pace. When it needs more time, the video slows down (not below this) and pauses briefly if needed, so both stay in sync.</div></div>
        <div class="ad-row"><div class="ad-label"><span>Subtitle size</span><span data-out="subtitleSize"></span></div>
          <input type="range" min="50" max="200" step="10" data-k="subtitleSize"></div>
        <div class="ad-row"><div class="ad-label">Translation</div>
          <select data-k="translator">
            <option value="youtube">YouTube auto-translate (default)</option>
            <option value="google">Google Translate</option>
          </select>
          <div class="ad-help">YouTube's translation needs no extra requests. Google Translate works per sentence and can read better, but it has rate limits.</div></div>
        <div class="ad-row"><div class="ad-label">Auto-dubbing</div>
          <select data-k="autoDub"><option value="false">Off</option><option value="true">On (dub every video with subtitles)</option></select></div>
        <div class="ad-links"><button class="ad-link" data-action="reset">Reset to defaults</button></div>
      </details>
    </div>`);

  const q = sel => container.querySelector(sel);
  const field = k => q(`[data-k="${k}"]`);
  const pct = x => Math.round(x * 100) + '%';
  let current = null;

  function render(s) {
    current = s;
    const lang = AD.getLanguage(s.lang);
    field('lang').value = lang.code;
    field('dubbing').value = s.dubbing;
    field('voice').innerHTML = AD.html(lang.voices.map(([id, label]) => `<option value="${id}">${label}</option>`).join(''));
    field('voice').value = AD.voiceFor(s);
    field('dubVolume').value = Math.round(s.dubVolume * 100);
    field('originalMode').value = s.originalMode;
    field('duckLevel').value = Math.round(s.duckLevel * 100);
    field('subtitles').value = s.subtitles;
    field('subtitlePosition').value = s.subtitlePosition;
    field('minRate').value = String(s.minRate);
    field('subtitleSize').value = Math.round(s.subtitleSize * 100);
    field('autoDub').value = String(!!s.autoDub);
    field('translator').value = s.translator;
    q('[data-out="dubVolume"]').textContent = pct(s.dubVolume);
    q('[data-out="duckLevel"]').textContent = pct(s.duckLevel);
    q('[data-out="subtitleSize"]').textContent = pct(s.subtitleSize);
    q('[data-out="dubRate"]').textContent = s.dubRate.toFixed(2) + 'x';
    const dub = s.dubbing !== 'off';
    container.querySelectorAll('[data-when="dub"]').forEach(el => el.classList.toggle('ad-hidden', !dub));
    q('[data-when="subs"]').classList.toggle('ad-hidden', s.subtitles === 'off');
    q('[data-when="duck"]').classList.toggle('ad-hidden', !dub || s.originalMode !== 'duck');
  }

  const readers = {
    lang: v => ({ lang: v }),
    dubbing: v => ({ dubbing: v }),
    voice: v => ({ voices: { ...current.voices, [current.lang]: v } }),
    dubVolume: v => ({ dubVolume: v / 100 }),
    originalMode: v => ({ originalMode: v }),
    duckLevel: v => ({ duckLevel: v / 100 }),
    subtitles: v => ({ subtitles: v }),
    subtitlePosition: v => ({ subtitlePosition: v }),
    minRate: v => ({ minRate: parseFloat(v) }),
    subtitleSize: v => ({ subtitleSize: v / 100 }),
    autoDub: v => ({ autoDub: v === 'true' }),
    translator: v => ({ translator: v }),
  };

  container.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (k && readers[k] && current) AD.saveSettings(readers[k](e.target.value));
  });
  const stepRate = delta => {
    if (!current) return;
    const rate = Math.round(Math.min(2, Math.max(0.5, current.dubRate + delta)) * 100) / 100;
    AD.saveSettings({ dubRate: rate });
  };
  q('[data-action="rate-down"]').addEventListener('click', () => stepRate(-0.05));
  q('[data-action="rate-up"]').addEventListener('click', () => stepRate(0.05));
  q('[data-action="reset"]').addEventListener('click', async () => {
    await chrome.storage.local.clear();
    await AD.saveSettings({ ...AD.DEFAULTS });
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') AD.loadSettings().then(render);
  });
  AD.loadSettings().then(render);
};
