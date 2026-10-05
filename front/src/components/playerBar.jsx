// Bottom music bar, rendered from the Topbar so it's on every page. All
// state lives in player/musicPlayer.js — this only displays and dispatches,
// so remounting on navigation never interrupts playback.
import { useLocation, useNavigate } from 'react-router-dom';
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useState } from 'react';
import {
    useMusicPlayer, ensureStarted, currentSong, isActiveHere, displayPosition,
    togglePlay, next, prev, seek, setShuffle, setRepeat, transferHere, remoteIsStale,
    pauseForVideo, setVolume, getVolume, streamUrl, setExpanded, closePlayer,
} from '../player/musicPlayer.js';
import FullPlayer from './fullPlayer.jsx';
import { listOffline, saveOffline, removeOffline } from '../player/offlineSongs.js';
import { openPlaylistPicker } from '../player/playlists.js';
import { formatClock } from '../utils/remote.js';
import CoverArt from './coverArt.jsx';
import { nextRepeatMode } from '../utils/player.js';

const Icon = {
    play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.14a.7.7 0 0 1 1.06-.6l11 6.86a.7.7 0 0 1 0 1.2l-11 6.86a.7.7 0 0 1-1.06-.6V5.14z" /></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></svg>,
    next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.6a.6.6 0 0 1 .93-.5l9.2 6.4a.6.6 0 0 1 0 1l-9.2 6.4A.6.6 0 0 1 5 18.4V5.6z" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" /></svg>,
    prev: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5.6a.6.6 0 0 0-.93-.5l-9.2 6.4a.6.6 0 0 0 0 1l9.2 6.4a.6.6 0 0 0 .93-.5V5.6z" /><rect x="5" y="5" width="2.5" height="14" rx="1" /></svg>,
    shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>,
    repeat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>,
    device: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
    download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12-4-4m4 4 4-4M4 21h16" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
    more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
    volume: <svg viewBox="0 0 24 24" fill="none"><path d="M4.5 9.5v5H8l4.5 4v-13L8 9.5H4.5z" fill="currentColor" /><path d="M15.5 9.2a4.2 4.2 0 0 1 0 5.6M18 6.8a7.6 7.6 0 0 1 0 10.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>,
};

export default function PlayerBar() {
    const s = useMusicPlayer();
    const location = useLocation();
    const [, setTick] = useState(0);
    const [scrub, setScrub] = useState(null);
    const navigate = useNavigate();
    // ⋯ options sheet (phones)
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [onPhone, setOnPhone] = useState(false);
    const [phoneBusy, setPhoneBusy] = useState(false);
    const onWatch = location.pathname.startsWith('/watch/');
    const song = currentSong(s);
    const here = isActiveHere(s);
    const stale = remoteIsStale(s);
    const paused = s.paused || stale;
    const visible = !!song && !onWatch && !s.dismissed;

    useEffect(() => { ensureStarted(); }, []);
    // Starting a video pauses the music (it'd fight the movie's audio).
    useEffect(() => {
        if (!onWatch) return;
        pauseForVideo();
        setExpanded(false);
    }, [onWatch]);
    // Remote devices advance their clock locally between progress reports.
    useEffect(() => {
        if (here || paused || !song) return;
        const iv = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, [here, paused, song]);
    // Lift bottom-anchored pills/bars above the player while it's showing.
    useEffect(() => {
        document.body.classList.toggle('has-music-player', visible);
        return () => document.body.classList.remove('has-music-player');
    }, [visible]);

    useEffect(() => {
        if (!optionsOpen || !song) return;
        listOffline().then(ids => setOnPhone(ids.has(song.videoId)));
    }, [optionsOpen, song?.videoId]);

    if (!visible) return null;

    const togglePhone = async () => {
        if (phoneBusy) return;
        setPhoneBusy(true);
        try {
            if (onPhone) { await removeOffline(song.videoId); setOnPhone(false); }
            else { await saveOffline(song.videoId); setOnPhone(true); }
        } catch { /* storage full / offline — the sheet just doesn't flip */ }
        setPhoneBusy(false);
    };

    const position = scrub ?? displayPosition(s);
    const duration = s.duration || 0;
    const commitScrub = (v) => { seek(v); setTimeout(() => setScrub(null), 400); };

    // Tapping the bar (anywhere but its controls) opens the full player.
    const openFull = (e) => {
        if (e.target.closest('button, a, input')) return;
        setExpanded(true);
    };

    return (
        <>
        <div className="player-bar" role="region" aria-label="Music player" onClick={openFull}>
            <div className="player-progress-mobile" style={{ width: duration ? `${(position / duration) * 100}%` : 0 }} />

            <div className="player-now" title="Open player">
                <CoverArt className="player-art" videoId={song.videoId} />
                <div className="player-meta">
                    <span className="player-title">{song.title}</span>
                    <span className="player-artist">
                        {here ? song.artist
                            : stale ? <>Last played on {s.activeDevice?.name || 'another device'}</>
                            : <>Playing on <strong>{s.activeDevice?.name || 'another device'}</strong></>}
                    </span>
                </div>
            </div>

            <div className="player-center">
                <div className="player-controls">
                    <button className={`player-icon-btn${s.shuffle ? ' on' : ''}`} onClick={() => setShuffle(!s.shuffle)} aria-label="Shuffle" title="Shuffle">{Icon.shuffle}</button>
                    <button className="player-icon-btn" onClick={prev} aria-label="Previous">{Icon.prev}</button>
                    <button className="player-play-btn" onClick={() => togglePlay()} aria-label={paused ? 'Play' : 'Pause'}>
                        {s.loading && here && !paused ? <span className="player-spinner" /> : (paused ? Icon.play : Icon.pause)}
                    </button>
                    <button className="player-icon-btn" onClick={() => next()} aria-label="Next">{Icon.next}</button>
                    <button
                        className={`player-icon-btn player-repeat${s.repeat !== 'off' ? ' on' : ''}`}
                        onClick={() => setRepeat(nextRepeatMode(s.repeat))}
                        aria-label={`Repeat: ${s.repeat}`}
                        title={`Repeat: ${s.repeat}`}
                    >
                        {Icon.repeat}{s.repeat === 'one' && <span className="player-repeat-one">1</span>}
                    </button>
                </div>
                <div className="player-scrub player-desktop">
                    <span className="player-time">{formatClock(position)}</span>
                    <input
                        type="range" min={0} max={duration || 1} step={0.5}
                        value={Math.min(position, duration || 1)}
                        disabled={!duration}
                        onChange={e => setScrub(Number(e.target.value))}
                        onMouseUp={e => commitScrub(Number(e.target.value))}
                        onTouchEnd={e => commitScrub(Number(e.target.value))}
                        onKeyUp={e => commitScrub(Number(e.target.value))}
                        aria-label="Seek"
                    />
                    <span className="player-time">{formatClock(duration)}</span>
                </div>
                {s.blocked && here && <button className="player-blocked" onClick={() => togglePlay(false)}>Tap to resume playback</button>}
                {s.error && here && <span className="player-error">{s.error}</span>}
            </div>

            <div className="player-right">
                <button className="player-icon-btn player-options-btn" onClick={() => setOptionsOpen(true)} aria-label="More options">{Icon.more}</button>
                <button className="player-icon-btn player-close-btn" onClick={closePlayer} aria-label="Close player" title="Close player">{Icon.close}</button>
                {!here && (
                    <button className="player-here-btn" onClick={transferHere} title="Move playback to this device">
                        {Icon.device}<span>Play here</span>
                    </button>
                )}
                <a className="player-icon-btn player-desktop" href={streamUrl(song.videoId, true)} title="Download MP3" aria-label="Download MP3">{Icon.download}</a>
                {here && (
                    <div className="player-volume player-desktop">
                        <span className="player-volume-icon">{Icon.volume}</span>
                        <input type="range" min={0} max={1} step={0.02} defaultValue={getVolume()} onChange={e => setVolume(Number(e.target.value))} aria-label="Volume" />
                    </div>
                )}
            </div>
        </div>
        {s.expanded && <FullPlayer />}
        {optionsOpen && (
            <div className="player-sheet-backdrop" onClick={() => setOptionsOpen(false)}>
                <div className="player-sheet" role="menu" onClick={e => e.stopPropagation()}>
                    <div className="player-sheet-head">
                        <CoverArt className="player-sheet-cover" videoId={song.videoId} />
                        <span className="player-meta">
                            <span className="player-title">{song.title}</span>
                            <span className="player-artist">{song.artist}</span>
                        </span>
                    </div>
                    <button onClick={() => { setOptionsOpen(false); setExpanded(true); }}>Open player</button>
                    <a href={streamUrl(song.videoId, true)} onClick={() => setOptionsOpen(false)}>Download MP3</a>
                    <button onClick={togglePhone} disabled={phoneBusy}>{phoneBusy ? 'Saving…' : onPhone ? 'Remove from this device' : 'Save to this device'}</button>
                    {!here && <button onClick={() => { setOptionsOpen(false); transferHere(); }}>Play on this device</button>}
                    <button onClick={() => { setOptionsOpen(false); openPlaylistPicker(song); }}>Add to playlist</button>
                    <button onClick={() => { setOptionsOpen(false); navigate('/music/library'); }}>Go to Library</button>
                    <button onClick={() => { setOptionsOpen(false); closePlayer(); }}>Close player</button>
                    <button className="player-sheet-cancel" onClick={() => setOptionsOpen(false)}>Cancel</button>
                </div>
            </div>
        )}
        </>
    );
}
