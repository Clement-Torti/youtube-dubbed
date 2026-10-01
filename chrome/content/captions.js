// Caption parsing (YouTube json3) and grouping into dub-able sentences.
(() => {
  const AD = globalThis.AD;

  const MAX_SEGMENT_SEC = 10;
  const MAX_SEGMENT_CHARS = 220;
  const PAUSE_SPLIT_SEC = 0.8;

  const clean = s => s
    .replace(/\[[^\]]*\]/g, ' ')       // [Music], [Applause]
    .replace(/[♪♫]+/g, ' ')
    .replace(/^\s*>>\s*/g, '')         // speaker change markers
    .replace(/\s+/g, ' ')
    .trim();

  // Returns time-stamped tokens: one per word for auto captions, one per cue for manual ones.
  AD.parseJson3 = function (json) {
    const tokens = [];
    for (const ev of json.events || []) {
      if (!ev.segs || ev.aAppend) continue;
      const evStart = (ev.tStartMs || 0) / 1000;
      const evEnd = evStart + (ev.dDurationMs || 0) / 1000;
      const wordTimed = ev.segs.length > 1 && ev.segs.some(s => s.tOffsetMs);
      if (wordTimed) {
        for (const seg of ev.segs) {
          const text = clean(seg.utf8 || '');
          if (text) tokens.push({ start: evStart + (seg.tOffsetMs || 0) / 1000, end: evEnd, text, word: true });
        }
      } else {
        const text = clean(ev.segs.map(s => s.utf8 || '').join(''));
        if (text) tokens.push({ start: evStart, end: evEnd, text });
      }
    }
    tokens.sort((a, b) => a.start - b.start);
    // Auto-caption lines stay on screen long after they are spoken; bound each token by the next.
    // Words only carry a start time; estimate their spoken length so real pauses stay visible.
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.word) tok.end = Math.min(tok.end, tok.start + 0.15 + 0.07 * tok.text.length);
      const next = tokens[i + 1];
      if (next && tok.end > next.start) tok.end = Math.max(tok.start + 0.05, next.start);
    }
    return tokens;
  };

  // Groups tokens into sentences: better translations and natural dub phrasing.
  AD.buildSegments = function (tokens) {
    const segments = [];
    let cur = null;
    for (const tok of tokens) {
      if (cur) {
        const text = cur.text;
        const endsSentence = /[.!?。！？…؟]["'»”)\]]?$/.test(text);
        const softBreak = cur.end - cur.start > 5 && /[,;:،，、]$/.test(text);
        const tooLong = tok.end - cur.start > MAX_SEGMENT_SEC || text.length + tok.text.length > MAX_SEGMENT_CHARS;
        if (tok.start - cur.end > PAUSE_SPLIT_SEC || endsSentence || softBreak || tooLong) {
          segments.push(cur);
          cur = null;
        }
      }
      if (!cur) cur = { start: tok.start, end: tok.end, text: tok.text };
      else {
        cur.text += ' ' + tok.text;
        cur.end = Math.max(cur.end, tok.end);
      }
    }
    if (cur) segments.push(cur);
    return segments.map((s, i) => ({ i, start: s.start, end: s.end, text: s.text }));
  };

  // Choose the best source track: human subtitles in the spoken language, else auto captions.
  AD.pickTrack = function (tracks, targetLang) {
    const base = c => (c || '').split('-')[0].toLowerCase();
    const asr = tracks.find(t => t.kind === 'asr');
    const manual = tracks.filter(t => t.kind !== 'asr');
    const spoken = asr ? base(asr.languageCode) : null;
    return (
      manual.find(t => base(t.languageCode) === base(targetLang)) ||
      (spoken && manual.find(t => base(t.languageCode) === spoken)) ||
      asr ||
      manual[0] ||
      null
    );
  };
})();
