// Full-screen "Now Playing" sheet (Spotify / Apple Music style). Opens from
// the mini player; the chevron, Escape, or a swipe down collapses it back.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useRef, useState } from 'react';
import {
    useMusicPlayer, currentSong, isActiveHere, displayPosition, remoteIsStale, coverUrl,
    togglePlay, next, prev, seek, setShuffle, setRepeat, transferHere, setExpanded, streamUrl,
} from '../player/musicPlayer.js';
import { formatClock } from '../utils/remote.js';
import { nextRepeatMode } from '../utils/player.js';
import CoverArt from './coverArt.jsx';

const I = {
    down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
    play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.14a.7.7 0 0 1 1.06-.6l11 6.86a.7.7 0 0 1 0 1.2l-11 6.86a.7.7 0 0 1-1.06-.6V5.14z" /></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></svg>,
    next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.6a.6.6 0 0 1 .93-.5l9.2 6.4a.6.6 0 0 1 0 1l-9.2 6.4A.6.6 0 0 1 5 18.4V5.6z" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" /></svg>,
    prev: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5.6a.6.6 0 0 0-.93-.5l-9.2 6.4a.6.6 0 0 0 0 1l9.2 6.4a.6.6 0 0 0 .93-.5V5.6z" /><rect x="5" y="5" width="2.5" height="14" rx="1" /></svg>,
    shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>,
    repeat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>,
    device: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
    download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12-4-4m4 4 4-4M4 21h16" /></svg>,
};

export default function FullPlayer() {
    const s = useMusicPlayer();
    const [, setTick] = useState(0);
    const [scrub, setScrub] = useState(null);
    const [dragY, setDragY] = useState(0);
    const [closing, setClosing] = useState(false);
    const touchStart = useRef(null);
    const song = currentSong(s);
    const here = isActiveHere(s);
    const stale = remoteIsStale(s);
    const paused = s.paused || stale;

    const close = () => {
        setClosing(true);
        setTimeout(() => { setExpanded(false); setClosing(false); setDragY(0); }, 220);
    };

    // Lock the page behind the sheet; Escape closes it.
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); };
    }, []);
    useEffect(() => {
        if (here || paused) return;
        const iv = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, [here, paused]);

    if (!song) return null;

    const position = scrub ?? displayPosition(s);
    const duration = s.duration || 0;
    const commit = (v) => { seek(v); setTimeout(() => setScrub(null), 400); };

    // Swipe down anywhere outside the timeline to dismiss.
    const onTouchStart = (e) => {
        if (e.target.closest('input[type="range"]')) return;
        touchStart.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
        if (touchStart.current === null) return;
        setDragY(Math.max(0, e.touches[0].clientY - touchStart.current));
    };
    const onTouchEnd = () => {
        if (touchStart.current === null) return;
        touchStart.current = null;
        if (dragY > 110) close();
        else setDragY(0);
    };

    return (
        <div
            className={`fp${closing ? ' fp-closing' : ''}`}
            role="dialog"
            aria-label="Now playing"
            style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <div className="fp-backdrop" style={{ backgroundImage: `url(${coverUrl(song.videoId)}), url(https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg)` }} />

            <div className="fp-top">
                <button className="fp-icon" onClick={close} aria-label="Minimize player">{I.down}</button>
                <div className="fp-context">
                    <span className="fp-context-label">Playing from</span>
                    <span className="fp-context-name">My Songs</span>
                </div>
                <a className="fp-icon" href={streamUrl(song.videoId, true)} aria-label="Download MP3">{I.download}</a>
            </div>

            <div className="fp-art-wrap">
                <CoverArt key={song.videoId} className={`fp-art${paused ? ' paused' : ''}`} videoId={song.videoId} />
            </div>

            <div className="fp-info">
                <div className="fp-title">{song.title}</div>
                <div className="fp-artist">{song.artist}</div>
            </div>

            <div className="fp-timeline">
                <input
                    type="range" min={0} max={duration || 1} step={0.5}
                    value={Math.min(position, duration || 1)}
                    disabled={!duration}
                    style={{ '--fp-pct': `${duration ? (Math.min(position, duration) / duration) * 100 : 0}%` }}
                    onChange={e => setScrub(Number(e.target.value))}
                    onTouchEnd={e => commit(Number(e.target.value))}
                    onMouseUp={e => commit(Number(e.target.value))}
                    onKeyUp={e => commit(Number(e.target.value))}
                    aria-label="Seek"
                />
                <div className="fp-times">
                    <span>{formatClock(position)}</span>
                    <span>-{formatClock(Math.max(0, duration - position))}</span>
                </div>
            </div>

            <div className="fp-controls">
                <button className={`fp-icon fp-side${s.shuffle ? ' on' : ''}`} onClick={() => setShuffle(!s.shuffle)} aria-label="Shuffle">{I.shuffle}</button>
                <button className="fp-icon fp-skip" onClick={prev} aria-label="Previous">{I.prev}</button>
                <button className="fp-play" onClick={() => togglePlay()} aria-label={paused ? 'Play' : 'Pause'}>{paused ? I.play : I.pause}</button>
                <button className="fp-icon fp-skip" onClick={() => next()} aria-label="Next">{I.next}</button>
                <button className={`fp-icon fp-side${s.repeat !== 'off' ? ' on' : ''}`} onClick={() => setRepeat(nextRepeatMode(s.repeat))} aria-label={`Repeat: ${s.repeat}`}>
                    {I.repeat}{s.repeat === 'one' && <span className="fp-repeat-one">1</span>}
                </button>
            </div>

            <div className="fp-bottom">
                {here ? (
                    <span className="fp-device here">{I.device}This device</span>
                ) : (
                    <>
                        <span className="fp-device">{I.device}{stale ? 'Last played on' : 'Playing on'} {s.activeDevice?.name || 'another device'}</span>
                        <button className="fp-here" onClick={transferHere}>Play here</button>
                    </>
                )}
            </div>
            {s.blocked && here && <button className="fp-blocked" onClick={() => togglePlay(false)}>Tap to resume playback</button>}
        </div>
    );
}
