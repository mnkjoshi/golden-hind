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
