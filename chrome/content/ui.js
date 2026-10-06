// In-player UI: control-bar button, settings panel and translated subtitle overlay.
(() => {
  const AD = globalThis.AD;

  const ICON = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4zm11.5 3A4.5 4.5 0 0 0 13 8v8a4.47 4.47 0 0 0 2.5-4zM13 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/><circle cx="19.5" cy="5" r="3" fill="#f472b6"/></svg>`;

  const GLOBAL_CSS = `
    .autodub-btn { display: inline-flex !important; align-items: center; justify-content: center; color: #fff; }
    .autodub-btn svg { width: 26px; height: 26px; }
    .autodub-btn.autodub-on { color: #f472b6; }
    .autodub-hide-captions .ytp-caption-window-container { display: none !important; }
    /* "Alongside" mode: YouTube's own caption sits right below the translated subtitle. */
    #movie_player.autodub-stack .ytp-caption-window-container .caption-window {
      top: var(--autodub-cap-top) !important; bottom: auto !important; left: 50% !important; right: auto !important;
      margin-left: 0 !important; transform: translateX(-50%) !important; }
    .autodub-sub { position: absolute; left: 50%; transform: translateX(-50%); z-index: 60; width: max-content; max-width: 75%; box-sizing: border-box;
      text-align: center; color: #fff; background: rgba(8, 8, 8, .78); padding: .12em .5em; cursor: default;
      border-radius: 4px; line-height: 1.4; font-family: "YouTube Noto", Roboto, Arial, sans-serif; white-space: pre-wrap;
      display: none; }
    .autodub-word { border-radius: 3px; }
    .autodub-word:hover { background: rgba(244, 114, 182, .5); }
    .autodub-tip { position: absolute; z-index: 61; transform: translate(-50%, -100%); display: none; pointer-events: none;
      background: #fff; color: #111; font-family: Roboto, Arial, sans-serif; font-weight: 500; padding: .25em .6em;
      border-radius: 6px; white-space: nowrap; box-shadow: 0 4px 14px rgba(0, 0, 0, .45); }
    .autodub-panel-host { position: absolute; top: 12px; right: 12px; z-index: 75; display: none; }
    .autodub-wait { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 70; display: none;
      align-items: center; gap: 14px; box-sizing: border-box; width: max-content; max-width: min(460px, 86%);
      padding: 14px 18px; border-radius: 12px; background: rgba(15, 15, 15, .9); color: #fff; pointer-events: none;
      font: 14px/1.4 Roboto, Arial, sans-serif; box-shadow: 0 8px 30px rgba(0, 0, 0, .45); }
    .autodub-wait b { display: block; font-size: 15px; font-weight: 500; margin-bottom: 2px; }
    .autodub-wait span { color: #ddd; }
    .autodub-retry { display: block; margin-top: 10px; pointer-events: auto; cursor: pointer; border: 0; border-radius: 6px;
      padding: 7px 14px; background: #f472b6; color: #fff; font: 500 13px Roboto, Arial, sans-serif; }
    .autodub-retry:hover { filter: brightness(1.08); }
    .autodub-spinner { flex: none; width: 28px; height: 28px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, .25);
      border-top-color: #f472b6; animation: autodub-spin .9s linear infinite; }
    @keyframes autodub-spin { to { transform: rotate(360deg); } }
  `;

  const PANEL_CSS = AD.SETTINGS_CSS + `
    .panel { width: 330px; max-height: calc(var(--ph, 600px) - 80px); overflow-y: auto; background: rgba(28, 28, 28, .97);
      border-radius: 12px; padding: 14px 16px 16px; box-shadow: 0 8px 30px rgba(0,0,0,.5); color: #f1f1f1;
      font: 13px/1.35 Roboto, Arial, sans-serif; scrollbar-width: thin; }
    .title { font-size: 15px; font-weight: 500; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .close { background: none; border: 0; color: #aaa; font-size: 20px; cursor: pointer; line-height: 1; }
    .status { color: #a8a8a8; font-size: 12px; min-height: 16px; margin: 8px 0 6px; }
    .status.error { color: #ff8a8a; }
    .main { width: 100%; border: 0; border-radius: 8px; padding: 11px; font: 500 14px Roboto, Arial, sans-serif;
      background: #f472b6; color: #fff; cursor: pointer; }
    .main:hover { filter: brightness(1.06); }
    .main.busy { background: #db5b9f; }
  `;

  const ui = AD.ui = { state: 'idle', message: '', hideTimer: null, hovering: false, pending: null };

  ui.init = function ({ onToggle, onRetry }) {
    ui.onToggle = onToggle;
    ui.onRetry = onRetry;
    if (!document.getElementById('autodub-style')) {
      const style = document.createElement('style');
      style.id = 'autodub-style';
      style.textContent = GLOBAL_CSS;
      document.documentElement.appendChild(style);
    }
    setInterval(ui.ensure, 1000);
    setInterval(updateCaptionStack, 200);
    // Clicking anywhere outside the open panel closes it.
    document.addEventListener('pointerdown', e => {
      if (!ui.panelHost || ui.panelHost.style.display !== 'block') return;
      const path = e.composedPath();
      if (!path.includes(ui.panelHost) && !(ui.btn && path.includes(ui.btn))) ui.togglePanel(false);
    }, true);
    ui.ensure();
  };

  const player = () => document.getElementById('movie_player');

  // YouTube rebuilds parts of the player; re-attach our elements when needed.
  ui.ensure = function () {
    const p = player();
    if (!p) return;
    const controls = p.querySelector('.ytp-right-controls');
    if (controls && !controls.querySelector('.autodub-btn')) {
      const btn = document.createElement('button');
      btn.className = 'ytp-button autodub-btn';
      btn.title = 'YouTube Dubbing & Translate';
      btn.innerHTML = AD.html(ICON);
      // First click starts dubbing; once dubbing (or after an error) it opens/closes the settings.
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (ui.state === 'idle') ui.onToggle();
        else ui.togglePanel();
      });
      controls.prepend(btn);
      ui.btn = btn;
      ui.render();
    }
    if (!ui.panelHost || !p.contains(ui.panelHost)) buildPanel(p);
    if (!ui.sub || !p.contains(ui.sub)) buildSubtitle(p);
    if (!ui.waitEl || !p.contains(ui.waitEl)) buildWait(p);
  };

  function buildWait(p) {
    const box = document.createElement('div');
    box.className = 'autodub-wait';
    const spinner = document.createElement('div');
    spinner.className = 'autodub-spinner';
    const text = document.createElement('div');
    const retry = document.createElement('button');
    retry.className = 'autodub-retry';
    retry.textContent = 'Try again now';
    // The click must not reach the player (play/pause).
    for (const ev of ['pointerdown', 'mousedown', 'dblclick']) retry.addEventListener(ev, e => e.stopPropagation());
    retry.addEventListener('click', e => { e.stopPropagation(); retryAction(); });
    text.append(document.createElement('b'), document.createElement('span'), retry);
    box.append(spinner, text);
    p.appendChild(box);
    ui.waitEl = box;
    ui.retryBtn = retry;
    if (ui.waitMessage) fillWait(ui.waitMessage);
  }

  function fillWait(message) {
    ui.waitEl.querySelector('b').textContent = message.title;
    ui.waitEl.querySelector('span').textContent = message.text;
    ui.retryBtn.style.display = message.retryable ? '' : 'none';
  }

  function retryAction() {
    if (ui.onRetry) ui.onRetry();
  }

  // Shown while the video waits for the dub. Short waits (< 0.6 s) never show it, to avoid flicker.
  ui.showWait = function (message) {
    ui.waitMessage = message;
    clearTimeout(ui.waitTimer);
    if (!ui.waitEl) return;
    if (!message) {
      ui.waitEl.style.display = 'none';
      return;
    }
    fillWait(message);
    if (ui.waitEl.style.display !== 'flex') {
      ui.waitTimer = setTimeout(() => { if (ui.waitMessage) ui.waitEl.style.display = 'flex'; }, 600);
    }
  };

  function buildSubtitle(p) {
    const sub = document.createElement('div');
    sub.className = 'autodub-sub';
    sub.dir = 'auto';
    const tip = document.createElement('div');
    tip.className = 'autodub-tip';
    tip.dir = 'auto';
    // Clicking on the subtitle must not toggle play/pause.
    for (const ev of ['click', 'dblclick', 'mousedown', 'pointerdown']) sub.addEventListener(ev, e => e.stopPropagation());
    sub.addEventListener('mouseenter', () => { ui.hovering = true; });
    sub.addEventListener('mouseleave', () => {
      ui.hovering = false;
      hideTip();
      if (ui.pending !== null) {
        const text = ui.pending;
        ui.pending = null;
        ui.showSubtitle(text);
      }
    });
    sub.addEventListener('mouseover', e => {
      const word = e.target.closest && e.target.closest('.autodub-word');
      if (word) showTip(word);
    });
    sub.addEventListener('mouseout', e => {
      if (e.target.closest && e.target.closest('.autodub-word')) hideTip();
    });
    p.append(sub, tip);
    ui.sub = sub;
    ui.tip = tip;
    ui.applySettings(ui.settings);
  }

  // Word-by-word spans so each word can be hovered (Intl.Segmenter also handles CJK and Arabic).
  function renderWords(text) {
    const sub = ui.sub;
    sub.textContent = '';
    let parts;
    try {
      parts = [...new Intl.Segmenter(ui.settings && ui.settings.lang, { granularity: 'word' }).segment(text)];
    } catch {
      parts = text.split(/(\s+)/).map(p => ({ segment: p, isWordLike: /\S/.test(p) }));
    }
    for (const part of parts) {
      if (part.isWordLike) {
        const span = document.createElement('span');
        span.className = 'autodub-word';
        span.textContent = part.segment;
        sub.appendChild(span);
      } else {
        sub.appendChild(document.createTextNode(part.segment));
      }
    }
  }

  const wordCache = new Map();
  function translateWord(word) {
    const lang = (ui.settings && ui.settings.lang) || 'auto';
    const key = lang + '|' + word;
    if (!wordCache.has(key)) {
      wordCache.set(key, AD.bg({ type: 'translate', texts: [word], sl: lang, tl: 'fr' })
        .then(r => r.translations[0] || word)
        .catch(() => { wordCache.delete(key); return '—'; }));
    }
    return wordCache.get(key);
  }

  function showTip(word) {
    const p = player();
    if (!p || !ui.tip) return;
    ui.tipWord = word;
    const wr = word.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    const tip = ui.tip;
    tip.style.left = (wr.left + wr.width / 2 - pr.left) + 'px';
    tip.style.top = (wr.top - pr.top - 6) + 'px';
    tip.style.fontSize = Math.max(13, parseFloat(ui.sub.style.fontSize || '20') * 0.6) + 'px';
    tip.textContent = '…';
    tip.style.display = 'block';
    translateWord(word.textContent).then(tr => { if (ui.tipWord === word) tip.textContent = tr; });
  }

  function hideTip() {
    ui.tipWord = null;
    if (ui.tip) ui.tip.style.display = 'none';
  }

  // Keeps YouTube's caption just below the translated subtitle, wherever that is placed.
  function updateCaptionStack() {
    const p = player();
    const s = ui.settings;
    const on = !!(p && s && ui.sub && s.subtitles === 'above' && (ui.state === 'dubbing' || ui.state === 'loading'));
    if (p) p.classList.toggle('autodub-stack', on);
    if (!on) return;
    const ph = p.clientHeight;
    if (ui.stackPos !== s.subtitlePosition) { ui.stackPos = s.subtitlePosition; ui.stackBottom = null; }
    let bottom;
    if (ui.sub.style.display === 'block') {
      bottom = (ui.sub.getBoundingClientRect().bottom - p.getBoundingClientRect().top) / ph;
      ui.stackBottom = bottom;
    } else if (ui.stackBottom != null) {
      bottom = ui.stackBottom;  // between lines: keep the caption where it was
    } else {
      const line = (parseFloat(ui.sub.style.fontSize) || 20) * 1.55 / ph;
      bottom = s.subtitlePosition === 'top' ? 0.08 + line : s.subtitlePosition === 'middle' ? 0.5 + line / 2 : 0.76;
    }
    p.style.setProperty('--autodub-cap-top', Math.round(bottom * ph + 4) + 'px');
  }

  // True while the mouse is over a visible subtitle: the engine then holds back the next subtitle.
  ui.isHovering = () => ui.hovering && !!ui.sub && ui.sub.style.display === 'block';

  function buildPanel(p) {
    const host = document.createElement('div');
    host.className = 'autodub-panel-host';
    // Keep clicks and keys inside the panel from reaching the player (play/pause, hotkeys).
    for (const ev of ['click', 'dblclick', 'mousedown', 'pointerdown', 'keydown', 'keyup', 'wheel', 'contextmenu']) {
      host.addEventListener(ev, e => e.stopPropagation());
    }
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = AD.html(`<style>${PANEL_CSS}</style>
      <div class="panel">
        <div class="title"><span>YouTube Dubbing &amp; Translate</span><button class="close" title="Close">×</button></div>
        <button class="main"></button>
        <div class="status"></div>
        <div class="settings"></div>
      </div>`);
    AD.mountSettings(root.querySelector('.settings'));
    root.querySelector('.close').addEventListener('click', () => ui.togglePanel(false));
    root.querySelector('.main').addEventListener('click', () => ui.onToggle());
    p.appendChild(host);
    ui.panelHost = host;
    ui.panelRoot = root;
    ui.render();
  }

  ui.togglePanel = function (force) {
    if (!ui.panelHost) return;
    const show = force !== undefined ? force : ui.panelHost.style.display !== 'block';
    ui.panelHost.style.display = show ? 'block' : 'none';
    const p = player();
    if (p) ui.panelHost.style.setProperty('--ph', p.clientHeight + 'px');
  };

  ui.setStatus = function (state, message) {
    ui.state = state;
    if (message !== undefined && message !== null) ui.message = message;
    ui.render();
  };

  ui.render = function () {
    const busy = ui.state === 'loading' || ui.state === 'dubbing';
    if (ui.btn) ui.btn.classList.toggle('autodub-on', busy);
    if (!ui.panelRoot) return;
    const status = ui.panelRoot.querySelector('.status');
    status.textContent = ui.message || '';
    status.classList.toggle('error', ui.state === 'error');
    const main = ui.panelRoot.querySelector('.main');
    main.textContent = busy ? (ui.state === 'loading' ? 'Loading… (Click to Stop)' : 'Dubbing… (Click to Stop)') : 'Dub this video';
    main.classList.toggle('busy', busy);
  };

  ui.showSubtitle = function (text) {
    if (!ui.sub) return;
    if (ui.isHovering()) {
      // Keep the hovered subtitle on screen; apply the change when the mouse leaves.
      ui.pending = text;
      return;
    }
    clearTimeout(ui.hideTimer);
    const visible = text && ui.settings && ui.settings.subtitles !== 'off';
    if (visible) {
      if (text !== ui.shown) renderWords(text);
      ui.shown = text;
      ui.sub.style.display = 'block';
      updateCaptionStack();
    } else {
      // Short delay avoids flicker between back-to-back segments.
      ui.hideTimer = setTimeout(() => { ui.sub.style.display = 'none'; ui.shown = null; hideTip(); }, text === '' ? 350 : 0);
    }
  };

  // Stopping dubbing clears the subtitle even while hovered.
  ui.clearSubtitle = function () {
    ui.pending = null;
    ui.hovering = false;
    hideTip();
    ui.showSubtitle('');
  };

  ui.applySettings = function (s) {
    ui.settings = s;
    const p = player();
    if (!s || !p) return;
    const active = ui.state === 'dubbing' || ui.state === 'loading';
    p.classList.toggle('autodub-hide-captions', active && s.subtitles === 'replace');
    if (ui.sub) {
      const size = Math.max(14, p.clientHeight * 0.042) * s.subtitleSize;
      ui.sub.style.fontSize = size + 'px';
      const st = ui.sub.style;
      st.top = st.bottom = '';
      if (s.subtitlePosition === 'top') { st.top = '8%'; st.transform = 'translateX(-50%)'; }
      else if (s.subtitlePosition === 'middle') { st.top = '50%'; st.transform = 'translate(-50%, -50%)'; }
      else { st.bottom = s.subtitles === 'replace' ? '10%' : '24%'; st.transform = 'translateX(-50%)'; }
      if (s.subtitles === 'off') ui.sub.style.display = 'none';
    }
  };

  window.addEventListener('resize', () => ui.applySettings(ui.settings));
  document.addEventListener('fullscreenchange', () => setTimeout(() => ui.applySettings(ui.settings), 200));
})();
