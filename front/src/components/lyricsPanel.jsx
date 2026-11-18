// Lyrics in the full player, in place of the cover (like the queue). Synced
// lyrics highlight the line being sung and keep it centred; tapping a line
// jumps there. Scrolling by hand pauses the auto-scroll for a few seconds.
// Plain lyrics (no timings) just scroll. Lyrics come from /music/lyrics (LRCLIB).
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useMusicPlayer, currentSong, displayPosition, seek } from '../player/musicPlayer.js';
import { parseLrc, activeLyricIndex } from '../utils/lyrics.js';

const API = 'https://ghb.mnkjoshi.ca';
const MANUAL_SCROLL_PAUSE_MS = 3500;
// Lyrics files run a touch late against the audio; leading slightly feels right.
const LEAD_S = 0.25;
const cache = new Map();   // videoId -> lyrics response (kept for the session)

export default function LyricsPanel() {
    const s = useMusicPlayer();
    const song = currentSong(s);
    const videoId = song?.videoId;
    const [lyrics, setLyrics] = useState(() => cache.get(videoId));
    const [, setTick] = useState(0);
    const scrollRef = useRef(null);
    const manualAt = useRef(0);
    const autoScrolling = useRef(false);

    useEffect(() => {
        if (!videoId) return;
        if (cache.has(videoId)) { setLyrics(cache.get(videoId)); return; }
        setLyrics(undefined);
        let cancelled = false;
        const user = localStorage.getItem('user'), token = localStorage.getItem('token');
        axios.post(`${API}/music/lyrics`, { user, token, videoId, title: song.title, artist: song.artist, duration: s.duration || 0 })
            .then(r => { cache.set(videoId, r.data); if (!cancelled) setLyrics(r.data); })
            .catch(() => { if (!cancelled) setLyrics({ none: true }); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    const lines = useMemo(() => parseLrc(lyrics?.synced), [lyrics]);
    const synced = lines.length > 0;

    // Keep the highlight moving between the player's own updates.
    useEffect(() => {
        if (!synced || s.paused) return;
        const iv = setInterval(() => setTick(t => t + 1), 250);
        return () => clearInterval(iv);
    }, [synced, s.paused]);

    const active = synced ? activeLyricIndex(lines, displayPosition(s) + LEAD_S) : -1;

    // Centre the active line, unless the user is scrolling around themselves.
    useEffect(() => {
        const box = scrollRef.current;
        if (!box || active < 0 || Date.now() - manualAt.current < MANUAL_SCROLL_PAUSE_MS) return;
        const el = box.querySelector(`[data-line="${active}"]`);
        if (!el) return;
        autoScrolling.current = true;
        box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
        const t = setTimeout(() => { autoScrolling.current = false; }, 600);
        return () => clearTimeout(t);
    }, [active]);

    const noteManual = () => { if (!autoScrolling.current) manualAt.current = Date.now(); };

    let body;
    if (lyrics === undefined) body = <p className="fl-state">Finding lyrics…</p>;
    else if (lyrics?.instrumental) body = <p className="fl-state">Instrumental — no lyrics.</p>;
    else if (synced) {
        body = (
            <div className="fl-lines">
                {lines.map((l, i) => (
                    <button
                        key={i}
                        data-line={i}
                        className={`fl-line${i === active ? ' active' : i < active ? ' past' : ''}${l.text ? '' : ' gap'}`}
                        onClick={() => { manualAt.current = 0; seek(l.time); }}
                    >{l.text || '♪'}</button>
                ))}
            </div>
        );
    } else if (lyrics?.plain) body = <p className="fl-plain">{lyrics.plain}</p>;
    else body = <p className="fl-state">No lyrics found for this song.</p>;

    return (
        <div className="fp-lyrics">
            <div
                className="fl-scroll"
                ref={scrollRef}
                onWheel={noteManual}
                onTouchMove={noteManual}
                onScroll={noteManual}
            >
                {body}
            </div>
            {(synced || lyrics?.plain) && <span className="fl-credit">Lyrics from LRCLIB</span>}
        </div>
    );
}
