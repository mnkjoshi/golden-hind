import crypto from 'crypto';
// Normalises an upstream subtitle file (WebVTT or SRT) to WebVTT, extracted
// from the /proxy/subtitle handler so the conversion can be unit tested.
//
// - Strips a leading BOM and normalises CRLF/CR to LF.
// - WebVTT input: keeps cues, removes any upstream X-TIMESTAMP-MAP so we own it.
// - SRT input: drops lone sequence numbers, converts `,` → `.` in timestamps,
//   and zero-pads single-digit hours.
// - When forHls is true, emits the X-TIMESTAMP-MAP header AVPlayer needs to
//   sync subtitle times to the stream PTS.
export function normalizeToVtt(data, { forHls = false } = {}) {
    const raw = String(data == null ? '' : data)
        .replace(/^﻿/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    const isVtt = raw.trimStart().startsWith('WEBVTT');

    let body;
    if (isVtt) {
        body = raw.replace(/^WEBVTT[^\n]*/i, 'WEBVTT').replace(/^X-TIMESTAMP-MAP=.*\n/im, '').trimEnd();
    } else {
        const converted = raw
            .replace(/^\d+\s*$/gm, '')                            // lone sequence numbers
            .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')   // comma → dot in timestamps
            // Pad single-digit hours on BOTH the start and (post-arrow) end
            // timestamps — anchoring on '^' alone left the end one unpadded,
            // producing invalid WebVTT like "00:00:05.000 --> 0:00:06.000".
            .replace(/(^|-->\s*)(\d):(\d{2}:\d{2}\.\d{3})/gm, '$10$2:$3')
            .trim();
        body = `WEBVTT\n\n${converted}`;
    }

    const header = forHls
        ? 'WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000'
        : 'WEBVTT';
    return body.replace(/^WEBVTT/i, header) + '\n';
}

// ── Track list curation ─────────────────────────────────────────────────────
// LookMovie returns every subtitle it knows: 100+ tracks for an episode, 600+
// for a film, unordered, many per language, and with plain names ("Arabic",
// "Protuguese (BR)", "zh-tw"). Players pick tracks by language code, so a
// wrong code or an unordered list means picking "English" can land on
// another language. Curation gives each track a real code, a unique label,
// a few variants for the viewer's language and one for every other, with
// the viewer's language first.

const LANGUAGES = {
    afrikaans: 'af', albanian: 'sq', amharic: 'am', arabic: 'ar', armenian: 'hy', azerbaijani: 'az',
    basque: 'eu', belarusian: 'be', bengali: 'bn', bosnian: 'bs', breton: 'br', bulgarian: 'bg',
    burmese: 'my', catalan: 'ca', chinese: 'zh', croatian: 'hr', czech: 'cs', danish: 'da',
    dutch: 'nl', english: 'en', esperanto: 'eo', estonian: 'et', farsi: 'fa', persian: 'fa',
    filipino: 'fil', tagalog: 'tl', finnish: 'fi', french: 'fr', galician: 'gl', georgian: 'ka',
    german: 'de', greek: 'el', gujarati: 'gu', hebrew: 'he', hindi: 'hi', hungarian: 'hu',
    icelandic: 'is', indonesian: 'id', irish: 'ga', italian: 'it', japanese: 'ja', kannada: 'kn',
    kazakh: 'kk', khmer: 'km', korean: 'ko', kurdish: 'ku', latvian: 'lv', lithuanian: 'lt',
    macedonian: 'mk', malay: 'ms', malayalam: 'ml', maltese: 'mt', marathi: 'mr', mongolian: 'mn',
    nepali: 'ne', norwegian: 'no', polish: 'pl', portuguese: 'pt', punjabi: 'pa', romanian: 'ro',
    russian: 'ru', serbian: 'sr', sinhala: 'si', slovak: 'sk', slovenian: 'sl', somali: 'so',
    spanish: 'es', swahili: 'sw', swedish: 'sv', tamil: 'ta', telugu: 'te', thai: 'th',
    turkish: 'tr', ukrainian: 'uk', urdu: 'ur', uzbek: 'uz', vietnamese: 'vi', welsh: 'cy',
};
const NAME_BY_CODE = Object.fromEntries(Object.entries(LANGUAGES).map(([name, code]) => [code, name]));
const TYPOS = { protuguese: 'portuguese', portugese: 'portuguese', chineese: 'chinese', spanich: 'spanish' };
const REGIONS = {
    br: { suffix: 'BR', label: 'Brazil' }, pt: { suffix: 'PT', label: 'Portugal' },
    tw: { suffix: 'TW', label: 'Traditional' }, hk: { suffix: 'HK', label: 'Hong Kong' },
    cn: { suffix: 'CN', label: 'Simplified' }, latam: { suffix: '419', label: 'Latin America' },
    lat: { suffix: '419', label: 'Latin America' },
};
const OPENSUBTITLES_CODES = {
    ea: { code: 'es-419', name: 'Spanish (Latin America)' },
    sp: { code: 'es', name: 'Spanish' },
    pb: { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    pm: { code: 'pt-MZ', name: 'Portuguese (Mozambique)' },
    ze: { code: 'zh', name: 'Chinese (Bilingual)' },
};
const titleCase = (s) => s.replace(/\b\p{L}/gu, c => c.toUpperCase());

// "Protuguese (BR)" → { code: 'pt-BR', name: 'Portuguese (Brazil)' };
// "zh-tw" → { code: 'zh-TW', name: 'Chinese (Traditional)' }; unknown → 'und'.
export function subtitleLanguage(raw) {
    const text = String(raw ?? '').trim().toLowerCase();
    if (!text) return { code: 'und', name: 'Unknown' };
    // OpenSubtitles' own two-letter codes that aren't ISO 639-1
    if (OPENSUBTITLES_CODES[text]) return OPENSUBTITLES_CODES[text];
    // A bare tag like "en", "pt-br", "zh_tw"
    const tag = /^([a-z]{2,3})(?:[-_]([a-z]{2,5}))?$/.exec(text);
    if (tag && NAME_BY_CODE[tag[1]]) {
        const region = tag[2] && REGIONS[tag[2]];
        const base = titleCase(NAME_BY_CODE[tag[1]]);
        return region
            ? { code: `${tag[1]}-${region.suffix}`, name: `${base} (${region.label})` }
            : { code: tag[1], name: base };
    }
    // A name, optionally with a region in brackets: "Portuguese (BR)"
    const m = /^([\p{L} ]+?)\s*(?:\(([^)]+)\))?$/u.exec(text);
    let word = (m?.[1] || text).trim();
    word = TYPOS[word] || word;
    const code = LANGUAGES[word];
    if (!code) return { code: 'und', name: titleCase(String(raw).trim()) };
    const regionKey = m?.[2]?.trim().toLowerCase();
    const region = regionKey && (REGIONS[regionKey] || { suffix: null, label: titleCase(regionKey) });
    return region
        ? { code: region.suffix ? `${code}-${region.suffix}` : code, name: `${titleCase(word)} (${region.label})` }
        : { code, name: titleCase(word) };
}

const subtitleFile = (s) => String(s?.file || s?.url || '');
const isUsableFile = (f) => f.startsWith('/') || /^https?:\/\//.test(f);

// Curated list: [{ file, language: unique label, lang: code }], the viewer's
// language first. Within a language, the release's own tracks (stored with
// the video, so timed to it) come before generic /captions/ ones.
export function curateSubtitles(subs, preferred = 'en', { preferredMax = 3, otherMax = 1 } = {}) {
    const pref = String(preferred || 'en').toLowerCase();
    const prefBase = pref.split('-')[0];
    const groups = new Map();
    const seen = new Set();
    for (const s of Array.isArray(subs) ? subs : []) {
        const file = subtitleFile(s);
        if (!isUsableFile(file) || seen.has(file)) continue;
        seen.add(file);
        const { code, name } = subtitleLanguage(s.language || s.lang || s.label);
        if (!groups.has(name)) groups.set(name, { code, name, files: [] });
        groups.get(name).files.push(file);
    }
    const rank = (g) => {
        const c = g.code.toLowerCase();
        if (c === pref) return 0;
        if (c.split('-')[0] === prefBase) return 1;
        return g.code === 'und' ? 3 : 2;
    };
    const ordered = [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const out = [];
    for (const g of ordered) {
        const own = g.files.filter(f => !f.startsWith('/captions/'));
        const generic = g.files.filter(f => f.startsWith('/captions/'));
        const keep = [...own, ...generic].slice(0, rank(g) <= 1 ? preferredMax : otherMax);
        keep.forEach((file, i) => out.push({ file, language: i === 0 ? g.name : `${g.name} ${i + 1}`, lang: g.code }));
    }
    return out;
}

// Short stable key for a curated list, so iOS manifest URLs can reference a
// server-side copy instead of carrying the whole list in the query string.
export function subtitlesKey(subs) {
    return crypto.createHash('sha1').update(JSON.stringify(subs)).digest('hex').slice(0, 16);
}
