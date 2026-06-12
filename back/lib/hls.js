// Pure HLS-manifest helpers, extracted from server.js so they can be unit
// tested without booting the Express server / Firebase. No external state.

export function slugify(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function absolutizeManifestUrl(baseUrl, value) {
    return new URL(value, baseUrl).toString();
}

export function proxiedHlsUrl(url) {
    return `/proxy/hls?url=${encodeURIComponent(url)}`;
}

export function rewriteManifestUriAttributes(line, baseUrl) {
    return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        if (uri.startsWith('data:')) return `URI="${uri}"`;
        const abs = absolutizeManifestUrl(baseUrl, uri);
        return `URI="${proxiedHlsUrl(abs)}"`;
    });
}

export function forceQuotedManifestAttribute(line, attr, value) {
    const re = new RegExp(`(,${attr}=)("[^"]*"|[^,]*)`);
    if (re.test(line)) return line.replace(re, `$1"${value}"`);
    return `${line},${attr}="${value}"`;
}

export function rewriteHlsManifest(manifestText, manifestUrl, { subtitleGroupId = null } = {}) {
    return manifestText.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;

        if (t.startsWith('#')) {
            let out = rewriteManifestUriAttributes(line, manifestUrl);
            if (subtitleGroupId && t.startsWith('#EXT-X-STREAM-INF')) {
                out = forceQuotedManifestAttribute(out, 'SUBTITLES', subtitleGroupId);
            }
            return out;
        }

        const abs = absolutizeManifestUrl(manifestUrl, t);
        return proxiedHlsUrl(abs);
    }).join('\n');
}

export function buildSingleVariantMaster({ originalUrl, rewrittenMediaUrl, subMediaLines }) {
    return [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        ...subMediaLines,
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,AVERAGE-BANDWIDTH=4500000,SUBTITLES="subs"',
        rewrittenMediaUrl || proxiedHlsUrl(originalUrl),
    ].join('\n');
}

// Best-effort ISO-639-1 code for a subtitle track, used to label HLS
// #EXT-X-MEDIA entries. Falls back to 'en' for the first track, 'und' otherwise.
export function hlsLanguageCode(sub, index) {
    const raw = String(sub.language || sub.lang || sub.label || '').toLowerCase();
    const file = String(sub.file || sub.url || '').toLowerCase();
    const text = `${raw} ${file}`;
    const languageMap = [
        ['en', /\b(en|eng|english)\b/],
        ['es', /\b(es|spa|spanish|espanol|español)\b/],
        ['fr', /\b(fr|fre|fra|french)\b/],
        ['de', /\b(de|ger|deu|german)\b/],
        ['it', /\b(it|ita|italian)\b/],
        ['pt', /\b(pt|por|portuguese)\b/],
        ['nl', /\b(nl|dut|nld|dutch)\b/],
        ['ru', /\b(ru|rus|russian)\b/],
        ['uk', /\b(uk|ukr|ukrainian)\b/],
        ['cs', /\b(cs|cze|ces|czech)\b/],
        ['el', /\b(el|gre|ell|greek)\b/],
        ['hi', /\b(hi|hin|hindi)\b/],
        ['id', /\b(id|ind|indonesian)\b/],
        ['sv', /\b(sv|swe|swedish)\b/],
        ['no', /\b(no|nor|norwegian)\b/],
        ['da', /\b(da|dan|danish)\b/],
        ['fi', /\b(fi|fin|finnish)\b/],
        ['pl', /\b(pl|pol|polish)\b/],
        ['tr', /\b(tr|tur|turkish)\b/],
        ['ar', /\b(ar|ara|arabic)\b/],
        ['ja', /\b(ja|jpn|japanese)\b/],
        ['ko', /\b(ko|kor|korean)\b/],
        ['zh', /\b(zh|chi|zho|chinese)\b/],
    ];
    const directTag = raw.match(/\b([a-z]{2})(?:[-_][a-z]{2})?\b/)?.[1];
    if (directTag && languageMap.some(([tag]) => tag === directTag)) return directTag;
    const found = languageMap.find(([, re]) => re.test(text));
    return found?.[0] || (index === 0 ? 'en' : 'und');
}
