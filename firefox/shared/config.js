// Shared constants and settings helpers (content scripts + popup).
var AD = globalThis.AD || (globalThis.AD = {});

// code = Google Translate / Google TTS language code.
// voices = Microsoft Edge neural voices (first = default).
AD.LANGUAGES = [
  { code: 'ar', name: 'العربية', voices: [
    ['ar-SA-HamedNeural', 'Hamed (Male)'], ['ar-SA-ZariyahNeural', 'Zariyah (Female)'],
    ['ar-EG-ShakirNeural', 'Shakir (Male, Egypt)'], ['ar-EG-SalmaNeural', 'Salma (Female, Egypt)'],
    ['ar-MA-JamalNeural', 'Jamal (Male, Morocco)'], ['ar-MA-MounaNeural', 'Mouna (Female, Morocco)'] ] },
  { code: 'en', name: 'English', voices: [
    ['en-US-AndrewNeural', 'Andrew (Male)'], ['en-US-AvaNeural', 'Ava (Female)'],
    ['en-US-GuyNeural', 'Guy (Male)'], ['en-US-JennyNeural', 'Jenny (Female)'],
    ['en-GB-RyanNeural', 'Ryan (Male, UK)'], ['en-GB-SoniaNeural', 'Sonia (Female, UK)'] ] },
  { code: 'fr', name: 'Français', voices: [
    ['fr-FR-HenriNeural', 'Henri (Male)'], ['fr-FR-DeniseNeural', 'Denise (Female)'],
    ['fr-FR-RemyMultilingualNeural', 'Rémy (Male)'], ['fr-FR-VivienneMultilingualNeural', 'Vivienne (Female)'],
    ['fr-CA-AntoineNeural', 'Antoine (Male, Canada)'], ['fr-CA-SylvieNeural', 'Sylvie (Female, Canada)'] ] },
  { code: 'es', name: 'Español', voices: [
    ['es-ES-AlvaroNeural', 'Álvaro (Male)'], ['es-ES-ElviraNeural', 'Elvira (Female)'],
    ['es-MX-JorgeNeural', 'Jorge (Male, Mexico)'], ['es-MX-DaliaNeural', 'Dalia (Female, Mexico)'] ] },
  { code: 'de', name: 'Deutsch', voices: [['de-DE-ConradNeural', 'Conrad (Male)'], ['de-DE-KatjaNeural', 'Katja (Female)']] },
  { code: 'it', name: 'Italiano', voices: [['it-IT-DiegoNeural', 'Diego (Male)'], ['it-IT-ElsaNeural', 'Elsa (Female)']] },
  { code: 'pt', name: 'Português', voices: [
    ['pt-BR-AntonioNeural', 'Antônio (Male, Brazil)'], ['pt-BR-FranciscaNeural', 'Francisca (Female, Brazil)'],
    ['pt-PT-DuarteNeural', 'Duarte (Male, Portugal)'], ['pt-PT-RaquelNeural', 'Raquel (Female, Portugal)'] ] },
  { code: 'ru', name: 'Русский', voices: [['ru-RU-DmitryNeural', 'Dmitry (Male)'], ['ru-RU-SvetlanaNeural', 'Svetlana (Female)']] },
  { code: 'tr', name: 'Türkçe', voices: [['tr-TR-AhmetNeural', 'Ahmet (Male)'], ['tr-TR-EmelNeural', 'Emel (Female)']] },
  { code: 'nl', name: 'Nederlands', voices: [['nl-NL-MaartenNeural', 'Maarten (Male)'], ['nl-NL-ColetteNeural', 'Colette (Female)']] },
  { code: 'pl', name: 'Polski', voices: [['pl-PL-MarekNeural', 'Marek (Male)'], ['pl-PL-ZofiaNeural', 'Zofia (Female)']] },
  { code: 'uk', name: 'Українська', voices: [['uk-UA-OstapNeural', 'Ostap (Male)'], ['uk-UA-PolinaNeural', 'Polina (Female)']] },
  { code: 'fa', name: 'فارسی', voices: [['fa-IR-FaridNeural', 'Farid (Male)'], ['fa-IR-DilaraNeural', 'Dilara (Female)']] },
  { code: 'he', name: 'עברית', voices: [['he-IL-AvriNeural', 'Avri (Male)'], ['he-IL-HilaNeural', 'Hila (Female)']] },
  { code: 'hi', name: 'हिन्दी', voices: [['hi-IN-MadhurNeural', 'Madhur (Male)'], ['hi-IN-SwaraNeural', 'Swara (Female)']] },
  { code: 'ur', name: 'اردو', voices: [['ur-PK-AsadNeural', 'Asad (Male)'], ['ur-PK-UzmaNeural', 'Uzma (Female)']] },
  { code: 'id', name: 'Bahasa Indonesia', voices: [['id-ID-ArdiNeural', 'Ardi (Male)'], ['id-ID-GadisNeural', 'Gadis (Female)']] },
  { code: 'vi', name: 'Tiếng Việt', voices: [['vi-VN-NamMinhNeural', 'Nam Minh (Male)'], ['vi-VN-HoaiMyNeural', 'Hoài My (Female)']] },
  { code: 'ja', name: '日本語', voices: [['ja-JP-KeitaNeural', 'Keita (Male)'], ['ja-JP-NanamiNeural', 'Nanami (Female)']] },
  { code: 'ko', name: '한국어', voices: [['ko-KR-InJoonNeural', 'InJoon (Male)'], ['ko-KR-SunHiNeural', 'SunHi (Female)']] },
  { code: 'zh-CN', name: '中文 (简体)', voices: [['zh-CN-YunxiNeural', 'Yunxi (Male)'], ['zh-CN-XiaoxiaoNeural', 'Xiaoxiao (Female)']] },
  { code: 'zh-TW', name: '中文 (繁體)', voices: [['zh-TW-YunJheNeural', 'YunJhe (Male)'], ['zh-TW-HsiaoChenNeural', 'HsiaoChen (Female)']] },
];

AD.DEFAULTS = {
  lang: 'ar',
  dubbing: 'on',          // 'on' = voice dubbing, 'off' = translated subtitles only
  voices: {},             // { [lang]: voiceId }
  dubVolume: 1,
  originalMode: 'duck',   // 'duck' | 'mute' | 'keep'
  duckLevel: 0.05,
  subtitles: 'above',     // 'above' | 'replace' | 'off'
  subtitlePosition: 'bottom', // 'top' | 'middle' | 'bottom'
  subtitleSize: 1,
  dubRate: 1,             // fixed speaking speed of the dubbed voice (1 = natural)
  minRate: 0.25,          // slowest the video may play to wait for the dub
  autoDub: false,
  translator: 'youtube',  // 'youtube' = YouTube auto-translate (Google Translate as fallback) | 'google'
};

// Everything the extension reports goes to the page console with this prefix.
AD.log = {
  info: (...args) => console.info('[AutoDub]', ...args),
  warn: (...args) => console.warn('[AutoDub]', ...args),
  error: (...args) => console.error('[AutoDub]', ...args),
};

AD.getLanguage = code => AD.LANGUAGES.find(l => l.code === code) || AD.LANGUAGES[0];

AD.voiceFor = s => {
  const lang = AD.getLanguage(s.lang);
  const chosen = s.voices && s.voices[lang.code];
  return lang.voices.some(v => v[0] === chosen) ? chosen : lang.voices[0][0];
};

AD.loadSettings = async () => ({ ...AD.DEFAULTS, ...(await browser.storage.local.get(null)) });
AD.saveSettings = patch => browser.storage.local.set(patch);

// YouTube enforces Trusted Types; wrap markup so innerHTML assignments are accepted.
AD.html = (() => {
  let policy = null;
  try { if (globalThis.trustedTypes && trustedTypes.createPolicy) policy = trustedTypes.createPolicy('autodub', { createHTML: s => s }); } catch {}
  return s => (policy ? policy.createHTML(s) : s);
})();
