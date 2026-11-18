// The queue, shown in the full player in place of the cover: the song that's
// playing, then "Up next" — drag the handle to reorder, × to remove, tap a
// song to jump to it — plus a picker for adding songs from the library.
// Edits go through musicPlayer.js, so they sync to every device.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useMemo, useState } from 'react';
import {
    useMusicPlayer, currentSong, playIndex, moveInQueue, removeFromQueue, addSongsToQueue,
    cachedLibrary, refreshLibrary,
} from '../player/musicPlayer.js';
import CoverArt from './coverArt.jsx';

const I = {
    grip: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="7" width="16" height="2" rx="1" /><rect x="4" y="11" width="16" height="2" rx="1" /><rect x="4" y="15" width="16" height="2" rx="1" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
    plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
    check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
    back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>,
};

export default function QueuePanel() {
    const s = useMusicPlayer();
    const [adding, setAdding] = useState(false);
    // { from, startY, dy, h } while a row is being dragged by its handle
    const [drag, setDrag] = useState(null);
    const song = currentSong(s);
    const base = s.index + 1;   // queue position of the first "Up next" row
    const upcoming = s.queue.slice(base);

    if (adding) return <AddSongs onDone={() => setAdding(false)} />;

    const target = drag
        ? Math.min(upcoming.length - 1, Math.max(0, drag.from + Math.round(drag.dy / drag.h)))
        : null;
    const startDrag = (e, from) => {
        const row = e.currentTarget.closest('.fq-row');
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ from, startY: e.clientY, dy: 0, h: row.getBoundingClientRect().height });
    };
    const moveDrag = (e) => { if (drag) setDrag(d => ({ ...d, dy: e.clientY - d.startY })); };
    const endDrag = () => {
        if (!drag) return;
        if (target !== drag.from) moveInQueue(base + drag.from, base + target);
        setDrag(null);
    };
    // Rows between the dragged one and its target slide over to make room.
    const shiftFor = (i) => {
        if (!drag) return 0;
        if (i === drag.from) return drag.dy;
        if (drag.from < i && i <= target) return -drag.h;
        if (target <= i && i < drag.from) return drag.h;
        return 0;
    };

    return (
        <div className="fp-queue">
            <div className="fq-head">
                <span className="fq-heading">Queue</span>
                <button className="fq-add-btn" onClick={() => setAdding(true)}>{I.plus}Add songs</button>
            </div>
            <div className="fq-scroll">
                {song && (
                    <>
                        <div className="fq-label">Now playing</div>
                        <div className="fq-row fq-now">
                            <CoverArt className="fq-cover" videoId={song.videoId} />
                            <span className="fq-text">
                                <span className="fq-title">{song.title}</span>
                                <span className="fq-artist">{song.artist}</span>
                            </span>
                        </div>
                    </>
                )}
                <div className="fq-label">Up next{upcoming.length ? ` · ${upcoming.length}` : ''}</div>
                {upcoming.length === 0 ? (
                    <p className="fq-empty">Nothing up next. Add songs from your library.</p>
                ) : (
                    <div className={`fq-list${drag ? ' dragging' : ''}`}>
                        {upcoming.map((id, i) => {
                            const info = s.songs[id] || { title: 'Loading…', artist: '' };
                            const shift = shiftFor(i);
                            return (
                                <div
                                    key={`${base + i}-${id}`}
                                    className={`fq-row${drag?.from === i ? ' lifted' : ''}`}
                                    style={shift ? { transform: `translateY(${shift}px)` } : undefined}
                                >
                                    <button className="fq-main" onClick={() => playIndex(base + i)} aria-label={`Play ${info.title}`}>
                                        <CoverArt className="fq-cover" videoId={id} />
                                        <span className="fq-text">
                                            <span className="fq-title">{info.title}</span>
                                            <span className="fq-artist">{info.artist}</span>
                                        </span>
                                    </button>
                                    <button className="fq-icon" onClick={() => removeFromQueue(base + i)} aria-label={`Remove ${info.title} from the queue`} title="Remove from queue">{I.close}</button>
                                    <span
                                        className="fq-icon fq-grip"
                                        role="button"
                                        aria-label={`Reorder ${info.title}`}
                                        title="Drag to reorder"
                                        onPointerDown={e => startDrag(e, i)}
                                        onPointerMove={moveDrag}
                                        onPointerUp={endDrag}
                                        onPointerCancel={() => setDrag(null)}
                                    >{I.grip}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// Library picker: filter by title/artist, + adds a song to the end of the queue.
function AddSongs({ onDone }) {
    const [library, setLibrary] = useState(() => cachedLibrary());
    const [filter, setFilter] = useState('');
    const [added, setAdded] = useState(() => new Set());
    useEffect(() => { refreshLibrary().then(list => { if (list?.length) setLibrary(list); }); }, []);

    const shown = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (!f) return library;
        return library.filter(x => `${x.title} ${x.artist}`.toLowerCase().includes(f));
    }, [library, filter]);

    const add = (song) => {
        addSongsToQueue([song]);
        setAdded(prev => new Set(prev).add(song.videoId));
    };

    return (
        <div className="fp-queue">
            <div className="fq-head">
                <button className="fq-back" onClick={onDone} aria-label="Back to queue">{I.back}</button>
                <span className="fq-heading">Add songs</span>
                <button className="fq-add-btn" onClick={onDone}>Done</button>
            </div>
            <input
                className="fq-search"
                type="search"
                placeholder="Search your library"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                aria-label="Search your library"
            />
            <div className="fq-scroll">
                {shown.length === 0 ? (
                    <p className="fq-empty">{library.length ? 'No songs match.' : 'Your library is empty.'}</p>
                ) : shown.map(x => (
                    <div key={x.videoId} className="fq-row">
                        <CoverArt className="fq-cover" videoId={x.videoId} />
                        <span className="fq-text">
                            <span className="fq-title">{x.title}</span>
                            <span className="fq-artist">{x.artist}</span>
                        </span>
                        <button
                            className={`fq-icon${added.has(x.videoId) ? ' on' : ''}`}
                            onClick={() => add(x)}
                            aria-label={`Add ${x.title} to the queue`}
                            title={added.has(x.videoId) ? 'Added — tap to add again' : 'Add to queue'}
                        >{added.has(x.videoId) ? I.check : I.plus}</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
