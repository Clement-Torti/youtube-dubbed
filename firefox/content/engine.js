// Dubbing engine.
//
// Sync model: everything is anchored on *video time*. Segment i's dub starts
// when the video reaches segments[i].start, always at natural voice speed.
// While it plays, the video's playbackRate is continuously set to
//     remainingVideoTime / remainingAudioTime
// (capped at the user's speed) so the video reaches the next segment exactly
// when the voice finishes. If that would need a rate below `minRate`, the
// video runs at minRate and pauses briefly at the boundary until the voice ends.
// If the next dub isn't ready yet, the video waits for it. While the user
// hovers the subtitle, the video keeps playing but waits before the next one.
(() => {
  const AD = globalThis.AD;

  const TICK_MS = 40;
  const LOOKAHEAD = 8;        // segments synthesized ahead
  const DECODE_AHEAD = 3;     // segments decoded to PCM ahead
  const TTS_CONCURRENCY = 3;
  const BOUNDARY_EPS = 0.04;  // seconds of video before the boundary where we hold
  const MAX_LATE_FRACTION = 0.6;
  const TTS_RETRY_DELAYS = [2000, 5000, 10000]; // waits before the 2nd, 3rd and 4th attempt

  // ------------------------------------------------------------ audio graph

  AD.audio = {
    ctx: null, dubGain: null, videoGain: null, mediaEl: null,

    init() {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.dubGain = this.ctx.createGain();
        this.dubGain.connect(this.ctx.destination);
        this.videoGain = this.ctx.createGain();
        this.videoGain.connect(this.ctx.destination);
        // The video's sound goes through this context once connected, so keep it running.
        this.ctx.addEventListener('statechange', () => {
          if (this.ctx.state !== 'running') {
            AD.log.warn(`audio engine is ${this.ctx.state}, trying to resume it`);
            this.resume();
          }
        });
        const unlock = () => this.resume();
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
      }
      this.resume();
    },
    resume() { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); },
    get running() { return !!this.ctx && this.ctx.state === 'running'; },

    // Route the video's original audio through a gain node (for ducking) without touching the player's volume.
    connect(video) {
      if (this.mediaEl === video || !this.running) return;
      this.mediaEl = video;
      try {
        this.ctx.createMediaElementSource(video).connect(this.videoGain);
      } catch (e) {
        AD.log.warn('cannot route video audio', e);
      }
    },

    setVideoGain(value, timeConstant = 0.08) {
      if (this.ctx) this.videoGain.gain.setTargetAtTime(value, this.ctx.currentTime, timeConstant);
    },
  };

  // ------------------------------------------------------------ audio helpers

  function trimSilence(ctx, buf, threshold = 0.01, margin = 0.03) {
    const data = buf.getChannelData(0);
    let a = 0, b = data.length - 1;
    while (a < b && Math.abs(data[a]) < threshold) a++;
    while (b > a && Math.abs(data[b]) < threshold) b--;
    const m = Math.floor(margin * buf.sampleRate);
    a = Math.max(0, a - m);
    b = Math.min(data.length - 1, b + m);
    const len = b - a + 1;
    if (len <= 0 || len === data.length) return buf;
    const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b + 1), c);
    return out;
  }

  async function decodeChunks(ctx, chunks) {
    const parts = [];
    for (const b64 of chunks) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      parts.push(trimSilence(ctx, await ctx.decodeAudioData(bytes.buffer)));
    }
    if (parts.length === 1) return parts[0];
    const gap = Math.floor(0.12 * ctx.sampleRate);
    const total = parts.reduce((n, p) => n + p.length, 0) + gap * (parts.length - 1);
    const out = ctx.createBuffer(1, total, ctx.sampleRate);
    let offset = 0;
    for (const p of parts) { out.copyToChannel(p.getChannelData(0), 0, offset); offset += p.length + gap; }
    return out;
  }

  // WSOLA time-stretch: changes the speed of speech without changing its pitch (rate > 1 = faster).
  // Overlapping 40 ms slices are re-spaced; each slice is shifted slightly to line up with the
  // previous one's waveform so there are no clicks or phasing.
  function timeStretch(ctx, buf, rate) {
    const sr = buf.sampleRate;
    const x = buf.getChannelData(0);
    const len = x.length;
    const N = Math.round(sr * 0.04) & ~1;
    const Hs = N / 2;                         // output hop
    const Ha = Hs * rate;                     // input hop
    const delta = Math.round(sr * 0.012);     // alignment search range
    const outLen = Math.ceil(len / rate);
    const out = new Float32Array(outLen + N);
    const norm = new Float32Array(outLen + N);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

    let prev = -1;
    for (let k = 0; k * Hs < outLen; k++) {
      const nominal = Math.round(k * Ha);
      let pos = nominal;
      if (prev >= 0) {
        const natural = prev + Hs;            // the input that would seamlessly continue the last slice
        const lo = Math.max(-delta, -nominal);
        const hi = Math.min(delta, len - N - nominal);
        let best = -Infinity;
        for (let d = lo; d <= hi; d += 2) {
          const p = nominal + d;
          let c = 0;
          for (let i = 0; i < Hs && natural + i < len; i += 4) c += x[natural + i] * x[p + i];
          if (c > best) { best = c; pos = p; }
        }
      }
      const synth = k * Hs;
      for (let i = 0; i < N && pos + i < len; i++) {
        out[synth + i] += x[pos + i] * win[i];
        norm[synth + i] += win[i];
      }
      prev = pos;
    }

    const res = ctx.createBuffer(1, outLen, sr);
    const o = res.getChannelData(0);
    for (let i = 0; i < outLen; i++) o[i] = norm[i] > 0.1 ? out[i] / norm[i] : out[i];
    return res;
  }

  AD.bg = msg => browser.runtime.sendMessage(msg).then(r => {
    if (!r || !r.ok) throw new Error((r && r.error) || 'Background error');
    return r;
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isAdShowing = () => !!document.querySelector('#movie_player.ad-showing');

  // ------------------------------------------------------------ Dubber

  AD.Dubber = class Dubber {
    constructor({ video, segments, sourceLang, needTranslate, settings, onStatus, onSubtitle, onFatal, isHovering }) {
      this.video = video;
      this.segments = segments;
      this.sourceLang = sourceLang;
      this.needTranslate = needTranslate;
      this.onStatus = onStatus;
      this.onSubtitle = onSubtitle;
      this.onFatal = onFatal;
      this.isHovering = isHovering || (() => false);
      this.shownText = '';
      this.idx = 0;             // next segment to speak
      this.cur = null;          // segment currently being spoken
      this.hold = null;         // why *we* paused the video: 'sync' | 'loading' | 'audio' | 'hover'
      this.ttsActive = 0;
      this.voiceGen = 0;
      this.decoded = new Set();
      this.lastStatus = '';
      this.applySettings(settings);
    }

    get dubAudio() { return this.settings.dubbing !== 'off'; }

    start() {
      this.active = true;
      AD.audio.init();
      this.baseRate = this.lastSetRate = this.video.playbackRate || 1;
      this.onSeeking = () => this.handleSeek();
      this.onPlay = () => {
        // releaseHold() clears the hold before calling play(), so a hold here means someone else resumed.
        if (this.hold && this.hold !== 'sync') this.logOnce('resumed', `video resumed while the dub was holding it (${this.hold}), by the viewer or by YouTube`);
        this.hold = null;  // any (re)start of the video ends a hold
      };
      this.skipQuietly = true;  // starting mid-video: earlier lines are expected to be passed
      this.video.addEventListener('seeking', this.onSeeking);
      this.video.addEventListener('play', this.onPlay);
      this.timer = setInterval(() => {
        try {
          this.tick();
        } catch (e) {
          AD.log.error('dubbing loop crashed:', e, this.snapshot());
        }
      }, TICK_MS);
      this.applyOriginalAudio();
      this.translateLoop();
      AD.log.info(`dubbing started: ${this.segments.length} lines, voice ${this.voice}, speed ${this.settings.dubRate}x, ` +
        (this.needTranslate ? `Google Translate ${this.sourceLang} -> ${this.targetLang}` : 'no translation needed'));
    }

    stop() {
      if (!this.active) return;
      AD.log.info(`dubbing stopped at ${this.video.currentTime.toFixed(1)}s`);
      this.active = false;
      clearInterval(this.timer);
      this.video.removeEventListener('seeking', this.onSeeking);
      this.video.removeEventListener('play', this.onPlay);
      this.stopAudio();
      if (this.hold) {
        this.hold = null;
        if (this.video.paused) this.video.play().catch(() => {});
      }
      this.video.playbackRate = this.baseRate;
      AD.audio.setVideoGain(1, 0.1);
      this.onSubtitle('');
    }

    applySettings(s) {
      const voice = AD.voiceFor(s);
      if (this.settings && (voice !== this.voice || s.dubRate !== this.settings.dubRate)) {
        // New voice or speed: drop synthesized audio for everything not currently playing.
        this.voiceGen++;
        for (const seg of this.segments) {
          if (this.cur && this.cur.seg === seg) continue;
          seg.chunks = seg.buffer = null;
          seg.failed = false;
          seg.tries = 0;
        }
        this.decoded.clear();
      }
      this.settings = s;
      this.voice = voice;
      this.targetLang = s.lang;
      this.minRate = Math.max(0.25, Math.min(1, s.minRate));
      if (AD.audio.dubGain) AD.audio.dubGain.gain.value = s.dubVolume;
      if (this.active) this.applyOriginalAudio();
    }

    applyOriginalAudio() {
      const s = this.settings;
      if (!this.dubAudio || s.originalMode === 'keep') AD.audio.setVideoGain(1);
      else if (s.originalMode === 'mute') AD.audio.setVideoGain(0);
      else AD.audio.setVideoGain(this.cur ? s.duckLevel : 1, 0.25);
    }

    status(message) {
      if (message === this.lastStatus) return;
      this.lastStatus = message;
      this.onStatus('dubbing', message);
    }

    boundary(i) {
      const next = this.segments[i + 1];
      if (next) return next.start;
      const s = this.segments[i];
      const end = Math.max(s.end, s.start) + 3;
      return isFinite(this.video.duration) ? Math.min(end, this.video.duration) : end;
    }

    // ---------------------------------------------------------- translation

    async translateLoop() {
      const segs = this.segments;
      if (!this.needTranslate) { for (const s of segs) s.tr = s.text; return; }
      let first = true, failures = 0;
      while (this.active) {
        let i = segs.findIndex((s, k) => k >= Math.max(0, this.idx - 1) && s.tr == null);
        if (i < 0) i = segs.findIndex(s => s.tr == null);
        if (i < 0) return;
        const batch = [];
        let chars = 0;
        const maxItems = first ? 6 : 40;  // small first batch so dubbing starts quickly
        for (let k = i; k < segs.length && segs[k].tr == null && batch.length < maxItems; k++) {
          if (batch.length && chars + segs[k].text.length > 3500) break;
          batch.push(segs[k]);
          chars += segs[k].text.length + 1;
        }
        try {
          const r = await AD.bg({ type: 'translate', texts: batch.map(s => s.text), sl: this.sourceLang, tl: this.targetLang });
          if (!this.active) return;
          batch.forEach((s, k) => { s.tr = r.translations[k] || s.text; });
          first = false;
          failures = 0;
        } catch (e) {
          AD.log.warn('translation failed', e);
          // Blocked by Google: retrying only prolongs the block, so stop right away.
          if (e.message.startsWith('Google Translate is temporarily blocking')) return this.onFatal(e.message);
          if (++failures >= 5) {
            AD.log.error('translation gave up after 5 failures:', e.message);
            return this.onFatal('Translation failed: ' + e.message);
          }
          await sleep(1500 * failures);
        }
      }
    }

    // ---------------------------------------------------------- TTS prefetch

    pump() {
      if (!this.dubAudio) return;
      const segs = this.segments;
      const from = Math.max(0, this.idx - (this.cur ? 1 : 0));
      for (let i = from; i < Math.min(segs.length, from + LOOKAHEAD) && this.ttsActive < TTS_CONCURRENCY; i++) {
        const s = segs[i];
        if (s.tr != null && !s.chunks && !s.ttsBusy && !s.failed && !(s.retryAt > performance.now())) this.synthesize(s);
      }
      for (let i = from; i < Math.min(segs.length, from + DECODE_AHEAD); i++) {
        const s = segs[i];
        if (s.chunks && !s.buffer && !s.decoding) this.decode(s);
      }
      for (const s of this.decoded) {
        if (s.i < this.idx - 2 || s.i > this.idx + LOOKAHEAD + 4) {
          if (this.cur && this.cur.seg === s) continue;
          s.buffer = null;
          this.decoded.delete(s);
        }
      }
    }

    synthesize(s) {
      if (!s.tr.trim()) { s.failed = true; return; }
      const gen = this.voiceGen;
      s.tries = s.tries || 0;
      s.ttsBusy = true;
      this.ttsActive++;
      const rate = this.settings.dubRate;
      AD.bg({ type: 'tts', text: s.tr, voice: this.voice, lang: this.targetLang, rate })
        .then(r => {
          if (gen !== this.voiceGen) return;
          s.chunks = r.chunks;
          // Microsoft voices bake the speed into the speech; the Google voice is time-stretched after decoding.
          s.stretch = r.provider === 'google' ? rate : 1;
          if (r.provider === 'google' && !this.warnedFallback) {
            this.warnedFallback = true;
            this.onStatus('dubbing', 'Dubbing with the Google voice');
          }
        })
        .catch(e => {
          AD.log.warn(`voice failed for line ${s.i} (attempt ${s.tries + 1})`, e);
          if (gen !== this.voiceGen) return;
          // Voice errors are usually temporary (rate limit, network): retry patiently while the
          // video waits, instead of silently dropping the line.
          if (++s.tries <= TTS_RETRY_DELAYS.length) {
            s.retryAt = performance.now() + TTS_RETRY_DELAYS[s.tries - 1];
          } else {
            s.failed = true;
            this.onStatus('dubbing', `Some lines have no voice (${e.message}). Dubbing continues.`);
          }
        })
        .finally(() => { s.ttsBusy = false; this.ttsActive--; });
    }

    decode(s) {
      const chunks = s.chunks;
      s.decoding = true;
      decodeChunks(AD.audio.ctx, chunks)
        .then(buf => (s.stretch && s.stretch !== 1 ? timeStretch(AD.audio.ctx, buf, s.stretch) : buf))
        .then(buf => { if (s.chunks === chunks) { s.buffer = buf; this.decoded.add(s); } })
        .catch(e => { AD.log.warn('decode failed', e); s.chunks = null; s.failed = true; })
        .finally(() => { s.decoding = false; });
    }

    // ---------------------------------------------------------- playback control

    setHold(reason) {
      if (this.hold !== reason) {
        this.holdSince = performance.now();
        // 'sync' holds are routine (voice longer than its slot); the others are worth knowing about.
        if (reason !== 'sync') this.logOnce('hold-' + reason, `video paused by the dub (${reason}) at ${this.video.currentTime.toFixed(1)}s`, 'info');
      }
      this.hold = reason;
      if (!this.video.paused) this.video.pause();
    }

    releaseHold() {
      if (!this.hold) return;
      const waited = (performance.now() - (this.holdSince || 0)) / 1000;
      if (waited > 3) AD.log.warn(`video was held ${waited.toFixed(1)}s (${this.hold})`);
      this.hold = null;
      if (this.video.paused) this.video.play().catch(() => {});
    }

    setRate(r) {
      const base = this.baseRate;
      // Round down: arriving slightly late at a boundary is harmless, early would cut the voice.
      r = r >= base - 0.02 ? base : Math.max(0.0625, Math.floor(r * 20) / 20);
      if (Math.abs(this.video.playbackRate - r) < 0.001) return;
      this.video.playbackRate = r;
      this.lastSetRate = r;
    }

    // The user (or YouTube's speed menu) changed the speed: that becomes the new maximum.
    trackUserRate() {
      const v = this.video;
      if (Math.abs(v.playbackRate - this.lastSetRate) > 0.001) {
        AD.log.info(`video speed changed outside the dub (${this.lastSetRate}x -> ${v.playbackRate}x): new normal speed`);
        this.baseRate = this.lastSetRate = v.playbackRate;
      }
    }

    elapsed(p) {
      return p.paused ? p.pausedAt : p.offset + (AD.audio.ctx.currentTime - p.ctxStart);
    }

    playSegment(s, offset) {
      const ctx = AD.audio.ctx;
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.connect(AD.audio.dubGain);
      src.start(0, offset);
      const p = { seg: s, src, offset, ctxStart: ctx.currentTime, duration: s.buffer.duration, boundary: this.boundary(s.i), paused: null };
      src.onended = () => { if (this.cur === p && !p.paused) this.finishSegment(); };
      this.cur = p;
      s.played = true;
      if (this.settings.originalMode === 'duck') AD.audio.setVideoGain(this.settings.duckLevel, 0.05);
      this.onSubtitle(s.tr);
    }

    pauseAudio(reason) {
      const p = this.cur;
      if (!p || p.paused) return;
      if (reason !== 'user') AD.log.info(`voice paused: ${reason === 'stall' ? 'video is buffering' : reason === 'ad' ? 'an ad is playing' : reason}`);
      p.pausedAt = this.elapsed(p);
      p.paused = reason;
      p.src.onended = null;
      try { p.src.stop(); } catch {}
    }

    resumeAudio() {
      const p = this.cur;
      if (!p || !p.paused) return;
      const ctx = AD.audio.ctx;
      const src = ctx.createBufferSource();
      src.buffer = p.seg.buffer;
      src.connect(AD.audio.dubGain);
      src.start(0, p.pausedAt);
      src.onended = () => { if (this.cur === p && !p.paused) this.finishSegment(); };
      Object.assign(p, { src, offset: p.pausedAt, ctxStart: ctx.currentTime, paused: null });
    }

    stopAudio() {
      const p = this.cur;
      if (!p) return;
      this.cur = null;
      p.src.onended = null;
      try { p.src.stop(); } catch {}
      if (this.settings.originalMode === 'duck') AD.audio.setVideoGain(1, 0.25);
    }

    finishSegment() {
      this.stopAudio();
      this.onSubtitle('');
      // The voice is done: the video goes back to normal speed right away, whatever comes next.
      this.setRate(this.baseRate);
      if (this.hold === 'sync') this.releaseHold();
    }

    handleSeek() {
      this.stopAudio();
      this.onSubtitle('');
      this.shownText = '';
      if (this.hold) this.releaseHold();
      this.setRate(this.baseRate);
      this.idx = 0; // tick() advances to the segment at the new position
      this.skipQuietly = true;
    }

    tick() {
      if (!this.active) return;
      const v = this.video;

      if (isAdShowing()) {
        this.pauseAudio('ad');
        this.setRate(this.baseRate);
        this.onSubtitle('');
        return;
      }

      this.trackUserRate();
      if (!this.dubAudio) return this.subtitleOnlyTick();

      AD.audio.connect(v);
      this.pump();

      if (!AD.audio.running) {
        // Browser autoplay policy: audio needs one click on the page.
        AD.audio.resume();
        if (!v.paused || this.hold) {
          if (this.hold !== 'audio') AD.log.warn(`audio engine is ${AD.audio.ctx.state}: the browser needs a click on the page before it plays sound`);
          this.setHold('audio');
          this.status('Click anywhere on the page to enable the dubbed audio');
        }
        return;
      }
      if (this.hold === 'audio') this.releaseHold();

      // Video paused by the user (or ended): pause the voice with it.
      if (v.paused && !this.hold) { this.pauseAudio('user'); return; }

      const t = v.currentTime;
      const stalled = !v.paused && (v.readyState < 3 || v.seeking);

      if (this.cur) {
        const p = this.cur;
        if (p.paused) {
          if (v.paused || stalled) return;
          this.resumeAudio();
        } else if (stalled) {
          this.pauseAudio('stall');
          return;
        }
        const remainingAudio = p.duration - this.elapsed(p);
        if (remainingAudio <= 0.01) return this.finishSegment();
        const remainingVideo = p.boundary - t;
        if (remainingVideo <= BOUNDARY_EPS) {
          this.setHold('sync');
          this.status('Waiting for the voice to finish…');
        } else if (!this.hold) {
          const rate = Math.max(this.minRate, remainingVideo / remainingAudio);
          this.setRate(rate);
          this.status(rate < this.baseRate - 0.02 ? `Dubbing · video slowed to ${this.video.playbackRate.toFixed(2)}x to stay in sync` : 'Dubbing…');
        }
        return;
      }

      // Idle: waiting for the next segment.
      if (this.hold === 'sync') this.releaseHold();
      if (!v.paused && !this.hold) this.watchdog(t);
      const segs = this.segments;
      while (this.idx < segs.length && this.boundary(this.idx) <= t) {
        const passed = segs[this.idx];
        if (!this.skipQuietly && !passed.played && !passed.skipped && !passed.failed) {
          AD.log.warn(`line ${passed.i} (at ${passed.start.toFixed(1)}s) was passed without being dubbed`, this.snapshot(passed));
        }
        this.idx++;
      }
      this.skipQuietly = false;
      const s = segs[this.idx];
      if (!s || t < s.start - 0.02) {
        if (this.hold) this.releaseHold();
        this.setRate(this.baseRate);
        this.status(s ? 'Dubbing…' : 'Dubbing finished');
        return;
      }
      if (s.failed) {
        AD.log.warn(`skipped line ${s.i}: no voice after ${s.tries} attempts`);
        s.skipped = true;
        this.idx++;
        return;
      }
      if (!s.buffer) {
        this.setRate(this.baseRate); // no voice playing: never keep the video slowed while waiting
        this.setHold('loading');
        this.status(s.tries ? 'Voice service busy, retrying…' : 'Preparing the voice…');
        return;
      }
      let offset = 0;
      const late = t - s.start;
      if (late > 0.4) {
        // Landed inside a segment (seek/resume): start the voice at the same relative position.
        const f = late / (this.boundary(s.i) - s.start);
        if (f > MAX_LATE_FRACTION) {
          AD.log.info(`skipped line ${s.i}: video already ${Math.round(f * 100)}% past it (after a seek or a delay)`);
          s.skipped = true;
          this.idx++;
          return;
        }
        offset = f * s.buffer.duration;
      }
      if (this.isHovering()) {
        // The user is reading the current subtitle: wait before replacing it.
        this.setHold('hover');
        this.status('Paused while you read the subtitle');
        return;
      }
      if (this.hold) this.releaseHold();
      this.playSegment(s, offset);
      this.idx++;
    }

    // Logs a message at most once every 10 s per key, so repeated situations don't flood the console.
    logOnce(key, message, level = 'warn') {
      const now = performance.now();
      this.logged = this.logged || {};
      const last = this.logged[key];
      if (last && now - last.at < 10000) { last.repeats++; return; }
      const suffix = last && last.repeats ? ` (repeated ${last.repeats}x since last report)` : '';
      this.logged[key] = { at: now, repeats: 0 };
      AD.log[level](message + suffix);
    }

    // Raises a warning when a line should be playing but nothing explains why it isn't.
    watchdog(t) {
      const now = performance.now();
      if (now - (this.lastWatch || 0) < 1000) return;
      this.lastWatch = now;
      const s = this.segments.find(x => t >= x.start && t < this.boundary(x.i));
      if (!s || s.played || s.failed || s.skipped || s.reported || t - s.start < 2) return;
      s.reported = true;
      AD.log.warn(`line ${s.i} (at ${s.start.toFixed(1)}s) should be dubbed but nothing is playing`, this.snapshot(s));
    }

    // Engine state for bug reports.
    snapshot(s = this.segments[this.idx]) {
      const v = this.video;
      const line = x => x && {
        index: x.i, start: +x.start.toFixed(2), text: x.text.slice(0, 80), translated: x.tr != null,
        voiceDownloaded: !!x.chunks, voiceDecoded: !!x.buffer, played: !!x.played, failed: !!x.failed,
        skipped: !!x.skipped, attempts: x.tries || 0, downloading: !!x.ttsBusy, decoding: !!x.decoding,
        retryInSeconds: x.retryAt > performance.now() ? +((x.retryAt - performance.now()) / 1000).toFixed(1) : 0,
      };
      return {
        videoTime: +v.currentTime.toFixed(2), videoPaused: v.paused, videoReadyState: v.readyState,
        videoSpeed: v.playbackRate, normalSpeed: this.baseRate, nextLineIndex: this.idx, hold: this.hold,
        playing: this.cur ? { line: this.cur.seg.i, paused: this.cur.paused } : null,
        audioEngine: AD.audio.ctx && AD.audio.ctx.state, downloadsInProgress: this.ttsActive,
        adShowing: isAdShowing(), line: line(s), next: line(s && this.segments[s.i + 1]),
      };
    }

    subtitleOnlyTick() {
      const t = this.video.currentTime;
      const s = this.segments.find(x => t >= x.start && t < Math.min(this.boundary(x.i), x.end + 1));
      const text = s && s.tr ? s.tr : '';
      if (text !== this.shownText && this.isHovering()) {
        // Subtitle is about to change while the user is reading it: wait.
        if (!this.video.paused || this.hold) this.setHold('hover');
        this.status('Paused while you read the subtitle');
        return;
      }
      if (this.hold === 'hover') this.releaseHold();
      if (text !== this.shownText) {
        this.shownText = text;
        this.onSubtitle(text);
      }
      this.idx = s ? s.i : this.segments.findIndex(x => x.start > t);
      if (this.idx < 0) this.idx = this.segments.length;
      this.status('Showing translated subtitles');
    }
  };
})();
