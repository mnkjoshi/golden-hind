// Full "Now playing" card for the music page on phones — big art, timeline,
// and transport controls. Same player engine as the bottom bar (which hides
// on this page on phones, since this replaces it).
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useState } from 'react';
import {
    useMusicPlayer, currentSong, isActiveHere, displayPosition, remoteIsStale,
    togglePlay, next, prev, seek, setShuffle, setRepeat, transferHere,
} from '../player/musicPlayer.js';
import { formatClock } from '../utils/remote.js';
import { nextRepeatMode } from '../utils/player.js';

const I = {
    play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.14a.7.7 0 0 1 1.06-.6l11 6.86a.7.7 0 0 1 0 1.2l-11 6.86a.7.7 0 0 1-1.06-.6V5.14z" /></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></svg>,
    next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.6a.6.6 0 0 1 .93-.5l9.2 6.4a.6.6 0 0 1 0 1l-9.2 6.4A.6.6 0 0 1 5 18.4V5.6z" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" /></svg>,
    prev: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5.6a.6.6 0 0 0-.93-.5l-9.2 6.4a.6.6 0 0 0 0 1l9.2 6.4a.6.6 0 0 0 .93-.5V5.6z" /><rect x="5" y="5" width="2.5" height="14" rx="1" /></svg>,
    shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>,
    repeat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>,
    back15: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.5V3L7.5 7 12 11V7.5c3.04 0 5.5 2.46 5.5 5.5A5.5 5.5 0 1 1 6.5 13" /></svg>,
    fwd15: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.5V3L16.5 7 12 11V7.5A5.5 5.5 0 1 0 17.5 13" /></svg>,
};

export default function NowPlaying({ onPlay, onShuffle }) {
    const s = useMusicPlayer();
    const [, setTick] = useState(0);
    const [scrub, setScrub] = useState(null);
    const song = currentSong(s);
    const here = isActiveHere(s);
    const stale = remoteIsStale(s);
    const paused = s.paused || stale;

    useEffect(() => {
        if (here || paused || !song) return;
        const iv = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, [here, paused, song]);

    if (!song) {
        return (
            <div className="np-card np-empty">
                <div className="np-empty-text">Nothing playing</div>
                <div className="np-empty-actions">
                    <button className="np-empty-play" onClick={onPlay}>{I.play}Play My Songs</button>
                    <button className="np-empty-shuffle" onClick={onShuffle}>{I.shuffle}Shuffle</button>
                </div>
            </div>
        );
    }

    const position = scrub ?? displayPosition(s);
    const duration = s.duration || 0;
    const commit = (v) => { seek(v); setTimeout(() => setScrub(null), 400); };

    return (
        <div className="np-card">
            <img className="np-art" src={`https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`} alt="" />
            <div className="np-meta">
                <span className="np-title">{song.title}</span>
                <span className="np-artist">
                    {here ? song.artist
                        : stale ? <>Last played on {s.activeDevice?.name || 'another device'}</>
                        : <>Playing on <strong>{s.activeDevice?.name || 'another device'}</strong></>}
                </span>
            </div>

            <div className="np-timeline">
                <input
                    type="range" min={0} max={duration || 1} step={0.5}
                    value={Math.min(position, duration || 1)}
                    disabled={!duration}
                    onChange={e => setScrub(Number(e.target.value))}
                    onTouchEnd={e => commit(Number(e.target.value))}
                    onMouseUp={e => commit(Number(e.target.value))}
                    aria-label="Seek"
                />
                <div className="np-times">
                    <span>{formatClock(position)}</span>
                    <span>-{formatClock(Math.max(0, duration - position))}</span>
                </div>
            </div>

            <div className="np-controls">
                <button className={`np-btn np-small${s.shuffle ? ' on' : ''}`} onClick={() => setShuffle(!s.shuffle)} aria-label="Shuffle">{I.shuffle}</button>
                <button className="np-btn" onClick={prev} aria-label="Previous">{I.prev}</button>
                <button className="np-btn np-small" onClick={() => seek(Math.max(0, position - 15))} aria-label="Back 15 seconds">{I.back15}<span className="np-skip-num">15</span></button>
                <button className="np-play" onClick={() => togglePlay()} aria-label={paused ? 'Play' : 'Pause'}>{paused ? I.play : I.pause}</button>
                <button className="np-btn np-small" onClick={() => seek(Math.min(duration || position + 15, position + 15))} aria-label="Forward 15 seconds">{I.fwd15}<span className="np-skip-num">15</span></button>
                <button className="np-btn" onClick={() => next()} aria-label="Next">{I.next}</button>
                <button className={`np-btn np-small${s.repeat !== 'off' ? ' on' : ''}`} onClick={() => setRepeat(nextRepeatMode(s.repeat))} aria-label={`Repeat: ${s.repeat}`}>
                    {I.repeat}{s.repeat === 'one' && <span className="np-repeat-one">1</span>}
                </button>
            </div>

            {!here && <button className="np-here" onClick={transferHere}>Play on this phone</button>}
            {s.blocked && here && <button className="np-here" onClick={() => togglePlay(false)}>Tap to resume playback</button>}
        </div>
    );
}
