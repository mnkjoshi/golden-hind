// Full-screen "Now Playing" sheet (Spotify / Apple Music style). Opens from
// the mini player; the chevron, Escape, or a swipe/flick down collapses it.
// Open, close and drag all move one CSS variable (--fp-y) under a single
// transition, so letting go mid-swipe glides from where the finger was.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useRef, useState } from 'react';
import {
    useMusicPlayer, currentSong, isActiveHere, displayPosition, remoteIsStale, coverUrl, deviceName,
    togglePlay, next, prev, seek, setShuffle, setRepeat, transferHere, setExpanded, streamUrl,
} from '../player/musicPlayer.js';
import { formatClock } from '../utils/remote.js';
import { nextRepeatMode } from '../utils/player.js';
import CoverArt from './coverArt.jsx';
import Scrubber from './scrubber.jsx';
import { openPlaylistPicker } from '../player/playlists.js';

const I = {
    down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
    play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.14a.7.7 0 0 1 1.06-.6l11 6.86a.7.7 0 0 1 0 1.2l-11 6.86a.7.7 0 0 1-1.06-.6V5.14z" /></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></svg>,
    next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.6a.6.6 0 0 1 .93-.5l9.2 6.4a.6.6 0 0 1 0 1l-9.2 6.4A.6.6 0 0 1 5 18.4V5.6z" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" /></svg>,
    prev: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5.6a.6.6 0 0 0-.93-.5l-9.2 6.4a.6.6 0 0 0 0 1l9.2 6.4a.6.6 0 0 0 .93-.5V5.6z" /><rect x="5" y="5" width="2.5" height="14" rx="1" /></svg>,
    shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>,
    repeat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>,
    device: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
    more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>,
    playlistAdd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h12M3 12h12M3 18h7M18 14v7M14.5 17.5h7" /></svg>,
    download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12-4-4m4 4 4-4M4 21h16" /></svg>,
};

export default function FullPlayer() {
    const s = useMusicPlayer();
    const [, setTick] = useState(0);
    const [scrub, setScrub] = useState(null);
    const [dragY, setDragY] = useState(0);
    const [shown, setShown] = useState(false);   // false = parked below the screen
    const [closing, setClosing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const touchStart = useRef(null);
    const menuRef = useRef(false);
    menuRef.current = menuOpen;
    const song = currentSong(s);
    const here = isActiveHere(s);
    const stale = remoteIsStale(s);
    const paused = s.paused || stale;

    const close = () => {
        if (closing) return;
        setMenuOpen(false);
        setClosing(true);
        setDragY(0);
        setTimeout(() => setExpanded(false), 320);
    };

    // Mount parked off-screen, then slide up on the next painted frame.
    useEffect(() => {
        let raf2;
        const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
        return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }, []);

    // Lock the page behind the sheet; Escape closes the menu, then the sheet.
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (menuRef.current) setMenuOpen(false);
            else close();
        };
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

    // Swipe down anywhere outside the seek bar / menu to dismiss: past 110px,
    // or a quick flick of any real distance.
    const onTouchStart = (e) => {
        if (closing || e.target.closest('.scrubber, .fp-menu')) return;
        touchStart.current = { y: e.touches[0].clientY, t: performance.now() };
    };
    const onTouchMove = (e) => {
        if (!touchStart.current) return;
        setDragY(Math.max(0, e.touches[0].clientY - touchStart.current.y));
    };
    const onTouchEnd = () => {
        if (!touchStart.current) return;
        const velocity = dragY / Math.max(1, performance.now() - touchStart.current.t); // px/ms
        touchStart.current = null;
        if (dragY > 110 || (dragY > 24 && velocity > 0.6)) close();
        else setDragY(0);
    };

    return (
        <div
            className={`fp${shown && !closing ? ' fp-shown' : ''}${closing ? ' fp-closing' : ''}`}
            role="dialog"
            aria-label="Now playing"
            style={dragY ? { '--fp-y': `${dragY}px`, transition: 'none' } : undefined}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <div className="fp-backdrop" style={{ backgroundImage: `url(${coverUrl(song.videoId)}), url(https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg)` }} />

            <div className="fp-top">
                <button className="fp-icon" onClick={close} aria-label="Minimize player">{I.down}</button>
                <div className="fp-context">
                    <span className="fp-context-label">{here ? 'Playing on this device' : stale ? 'Last played from' : 'Playing from'}</span>
                    <span className="fp-context-name">{here ? deviceName() : s.activeDevice?.name || 'Another device'}</span>
                </div>
                <div className="fp-menu-wrap">
                    <button className={`fp-icon${menuOpen ? ' on' : ''}`} onClick={() => setMenuOpen(o => !o)} aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen}>{I.more}</button>
                    {menuOpen && (
                        <>
                            <div className="fp-menu-scrim" onClick={() => setMenuOpen(false)} />
                            <div className="fp-menu" role="menu">
                                <button role="menuitem" onClick={() => { setMenuOpen(false); openPlaylistPicker(song); }}>{I.playlistAdd}Add to playlist</button>
                                <a role="menuitem" href={streamUrl(song.videoId, true)} onClick={() => setMenuOpen(false)}>{I.download}Download MP3</a>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="fp-art-wrap">
                <CoverArt key={song.videoId} className={`fp-art${paused ? ' paused' : ''}`} videoId={song.videoId} />
            </div>

            <div className="fp-info">
                <div className="fp-title">{song.title}</div>
                <div className="fp-artist">{song.artist}</div>
            </div>

            <div className="fp-timeline">
                <Scrubber
                    className="fp-scrubber"
                    value={Math.min(position, duration || 0)}
                    max={duration}
                    disabled={!duration}
                    onScrub={setScrub}
                    onCommit={commit}
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
