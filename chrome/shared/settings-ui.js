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
  .ad-section { border-top: 1px solid var(--line); }
  .ad-section > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; font-size: 13px; font-weight: 500; color: var(--text); user-select: none; }
  .ad-section > summary::-webkit-details-marker { display: none; }
  .ad-section > summary::after { content: '›'; color: var(--muted); font-size: 18px; line-height: 1; transition: transform .15s; }
  .ad-section[open] > summary::after { transform: rotate(90deg); }
  .ad-section > summary small { color: var(--muted); font-weight: 400; font-size: 11px; margin-left: auto; margin-right: 10px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
  .ad-section-body { padding-bottom: 6px; }
  .ad-link { background: none; border: 0; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
  .ad-link:hover { color: var(--text); text-decoration: underline; }
  .ad-hidden { display: none !important; }
  .ad-stepper { display: flex; align-items: center; gap: 8px; }
  .ad-stepper button, .ad-rule button { width: 32px; height: 30px; flex: none; border-radius: 6px; border: 1px solid var(--line);
    background: var(--field); color: var(--text); font: 500 16px Roboto, Arial, sans-serif; cursor: pointer; }
  .ad-stepper button:hover, .ad-rule button:hover { border-color: var(--pink); }
  .ad-stepper output { flex: 1; text-align: center; background: var(--field); border: 1px solid var(--line); border-radius: 6px;
    padding: 6px 0; font-variant-numeric: tabular-nums; }
  .ad-rule { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .ad-rule span { flex: none; color: var(--muted); font-size: 12px; }
  .ad-rule select { flex: 1; min-width: 0; }
  .ad-add { width: 100%; padding: 7px; border-radius: 6px; border: 1px dashed var(--line); background: none; color: var(--text);
    font: inherit; cursor: pointer; }
  .ad-add:hover { border-color: var(--pink); color: var(--pink); }
`;

AD.mountSettings = function (container) {
  const langOptions = AD.LANGUAGES.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  const ruleOptions = `<option value="*">Any language</option>` + langOptions;
  const rateOptions = [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(r => `<option value="${r}">${r === 1 ? 'Never slow down (pause instead)' : r + 'x'}</option>`).join('');
  container.innerHTML = AD.html(`
    <div class="ad-root">
      <details class="ad-section" data-section="dubbing">
        <summary>Dubbing <small data-sum="dubbing"></small></summary>
        <div class="ad-section-body">
          <div class="ad-row"><div class="ad-label">Dubbing language</div><select data-k="lang">${langOptions}</select></div>
          <div class="ad-row"><div class="ad-label">Mode</div>
            <select data-k="dubbing"><option value="on">Voice dubbing</option><option value="off">Translated subtitles only</option></select></div>
          <div class="ad-row" data-when="dub"><div class="ad-label">Voice</div><select data-k="voice"></select></div>
          <div class="ad-row" data-when="dub"><div class="ad-label">Voice speed</div>
            <div class="ad-stepper"><button data-action="rate-down" title="-0.05x">−</button><output data-out="dubRate"></output><button data-action="rate-up" title="+0.05x">+</button></div>
            <div class="ad-help">The voice always speaks at exactly this speed. The video adapts its own speed to stay in sync.</div></div>
          <div class="ad-row" data-when="dub"><div class="ad-label"><span>Volume</span><span data-out="dubVolume"></span></div>
            <input type="range" min="0" max="100" data-k="dubVolume"></div>
        </div>
      </details>

      <details class="ad-section" data-section="original" data-when="dub">
        <summary>Original audio <small data-sum="original"></small></summary>
        <div class="ad-section-body">
          <div class="ad-row"><div class="ad-label">While dubbing</div>
            <select data-k="originalMode">
              <option value="duck">Lower the original audio</option>
              <option value="mute">Mute the original audio</option>
              <option value="keep">Keep it at full volume</option>
            </select></div>
          <div class="ad-row" data-when="duck"><div class="ad-label"><span>Lower to</span><span data-out="duckLevel"></span></div>
            <input type="range" min="0" max="50" data-k="duckLevel"></div>
        </div>
      </details>

      <details class="ad-section" data-section="subtitles">
        <summary>Subtitles <small data-sum="subtitles"></small></summary>
        <div class="ad-section-body">
          <div class="ad-row"><div class="ad-label">Translated subtitles</div>
            <select data-k="subtitles">
              <option value="above">Show alongside YouTube captions</option>
              <option value="replace">Replace YouTube captions</option>
              <option value="off">Don't show</option>
            </select></div>
          <div class="ad-row" data-when="subs"><div class="ad-label">Position</div>
            <select data-k="subtitlePosition">
              <option value="bottom">Bottom</option>
              <option value="middle">Middle</option>
              <option value="top">Top</option>
            </select></div>
          <div class="ad-row" data-when="subs"><div class="ad-label"><span>Size</span><span data-out="subtitleSize"></span></div>
            <input type="range" min="50" max="200" step="10" data-k="subtitleSize"></div>
        </div>
      </details>

      <details class="ad-section" data-section="auto">
        <summary>Automatic dubbing <small data-sum="auto"></small></summary>
        <div class="ad-section-body">
          <div class="ad-rules"></div>
          <button class="ad-add" data-action="add-rule">+ Add a rule</button>
          <div class="ad-help" data-out="autoHelp"></div>
        </div>
      </details>

      <details class="ad-section" data-section="advanced">
        <summary>Advanced</summary>
        <div class="ad-section-body">
          <div class="ad-row" data-when="dub"><div class="ad-label">Slowest video speed</div>
            <select data-k="minRate">${rateOptions}</select>
            <div class="ad-help">When the voice needs more time, the video slows down (not below this) and pauses briefly if needed, so both stay in sync.</div></div>
          <div class="ad-row"><div class="ad-label">Translation</div>
            <select data-k="translator">
              <option value="youtube">YouTube auto-translate (default)</option>
              <option value="google">Google Translate</option>
            </select>
            <div class="ad-help">YouTube's translation needs no extra requests. Google Translate works per sentence and can read better, but it has rate limits.</div></div>
          <button class="ad-link" data-action="reset">Reset all settings</button>
        </div>
      </details>
    </div>`);

  const q = sel => container.querySelector(sel);
  const field = k => q(`[data-k="${k}"]`);
  const pct = x => Math.round(x * 100) + '%';
  const langName = code => code === '*' ? 'Any language' : (AD.LANGUAGES.find(l => l.code === code) || { name: code }).name;
  let current = null;

  // Remember which sections are open (Dubbing open the first time).
  AD.loadSettings().then(s => {
    const open = s.openSections || { dubbing: true };
    container.querySelectorAll('.ad-section').forEach(d => { d.open = !!open[d.dataset.section]; });
  });
  container.addEventListener('toggle', e => {
    if (!e.target.classList || !e.target.classList.contains('ad-section')) return;
    const open = {};
    container.querySelectorAll('.ad-section').forEach(d => { open[d.dataset.section] = d.open; });
    AD.saveSettings({ openSections: open });
  }, true);

  function renderRules(s) {
    const box = q('.ad-rules');
    box.textContent = '';
    s.autoRules.forEach((code, i) => {
      const row = document.createElement('div');
      row.className = 'ad-rule';
      row.innerHTML = AD.html(`<span>If the original is</span><select data-rule="${i}">${ruleOptions}</select><button data-remove="${i}" title="Remove this rule">×</button>`);
      row.querySelector('select').value = code;
      box.appendChild(row);
    });
    const target = langName(s.lang);
    q('[data-out="autoHelp"]').textContent = s.autoRules.length
      ? `Each video whose original language matches a rule is dubbed into ${target} automatically, if it has subtitles and YouTube has no ${target} audio track.`
      : `No rule: dubbing only starts when you click. Add a rule to dub videos into ${target} automatically.`;
  }

  function render(s) {
    current = s;
    const lang = AD.getLanguage(s.lang);
    const dub = s.dubbing !== 'off';
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
    field('translator').value = s.translator;
    q('[data-out="dubVolume"]').textContent = pct(s.dubVolume);
    q('[data-out="duckLevel"]').textContent = pct(s.duckLevel);
    q('[data-out="subtitleSize"]').textContent = pct(s.subtitleSize);
    q('[data-out="dubRate"]').textContent = s.dubRate.toFixed(2) + 'x';
    renderRules(s);

    // One-line summaries on the section headers, so closed sections still tell what is set.
    const voiceLabel = (lang.voices.find(v => v[0] === AD.voiceFor(s)) || ['', ''])[1].replace(/ \(.*\)$/, '');
    q('[data-sum="dubbing"]').textContent = dub ? `${lang.name} · ${voiceLabel} · ${s.dubRate.toFixed(2)}x` : `${lang.name} · subtitles only`;
    q('[data-sum="original"]').textContent = { duck: `Lowered to ${pct(s.duckLevel)}`, mute: 'Muted', keep: 'Full volume' }[s.originalMode];
    q('[data-sum="subtitles"]').textContent = s.subtitles === 'off' ? 'Hidden'
      : `${s.subtitles === 'replace' ? 'Replace captions' : 'With captions'} · ${s.subtitlePosition}`;
    q('[data-sum="auto"]').textContent = s.autoRules.length ? s.autoRules.map(langName).join(', ') + ' → ' + lang.name : 'Off';

    container.querySelectorAll('[data-when="dub"]').forEach(el => el.classList.toggle('ad-hidden', !dub));
    container.querySelectorAll('[data-when="subs"]').forEach(el => el.classList.toggle('ad-hidden', s.subtitles === 'off'));
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
    translator: v => ({ translator: v }),
  };

  container.addEventListener('input', e => {
    if (!current) return;
    const k = e.target.dataset && e.target.dataset.k;
    if (k && readers[k]) return AD.saveSettings(readers[k](e.target.value));
    const rule = e.target.dataset && e.target.dataset.rule;
    if (rule !== undefined) {
      const rules = current.autoRules.slice();
      rules[+rule] = e.target.value;
      AD.saveSettings({ autoRules: [...new Set(rules)] });
    }
  });
  container.addEventListener('click', e => {
    if (!current) return;
    const remove = e.target.dataset && e.target.dataset.remove;
    if (remove !== undefined) AD.saveSettings({ autoRules: current.autoRules.filter((_, i) => i !== +remove) });
  });
  q('[data-action="add-rule"]').addEventListener('click', () => {
    if (!current) return;
    const next = ['en', ...AD.LANGUAGES.map(l => l.code)].find(c => c !== current.lang && !current.autoRules.includes(c)) || '*';
    AD.saveSettings({ autoRules: [...current.autoRules, next] });
  });
  const stepRate = delta => {
    if (!current) return;
    const rate = Math.round(Math.min(2, Math.max(0.5, current.dubRate + delta)) * 100) / 100;
    AD.saveSettings({ dubRate: rate });
  };
  q('[data-action="rate-down"]').addEventListener('click', () => stepRate(-0.05));
  q('[data-action="rate-up"]').addEventListener('click', () => stepRate(0.05));
  q('[data-action="reset"]').addEventListener('click', async () => {
    if (!confirm('Reset all settings to their defaults?')) return;
    await chrome.storage.local.clear();
    await AD.saveSettings({ ...AD.DEFAULTS });
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') AD.loadSettings().then(render);
  });
  AD.loadSettings().then(render);
};
