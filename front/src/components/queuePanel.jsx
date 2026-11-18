// The queue, shown in the full player in place of the cover: the song that's
// playing, then "Up next" — drag the handle to reorder, swipe a song sideways
// (or ×) to remove it, tap a song to jump to it — plus a picker for adding
// songs from the library. Edits go through musicPlayer.js, so they sync to
// every device.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    useMusicPlayer, currentSong, playIndex, moveInQueue, removeFromQueue, addSongsToQueue,
    cachedLibrary, refreshLibrary,
} from '../player/musicPlayer.js';
import CoverArt from './coverArt.jsx';

// Holding a dragged song this close to the list's top or bottom edge scrolls
// it, faster the closer to the edge (up to EDGE_SPEED px per frame).
const EDGE_PX = 64;
const EDGE_SPEED = 14;
// A sideways swipe this far (or a quick flick) removes the song.
const SWIPE_REMOVE_PX = 110;
// Removal: the row slides out, then collapses so the rows below glide up.
const LEAVE_MS = 380;
const ENTER_MS = 400;

const I = {
    grip: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="7" width="16" height="2" rx="1" /><rect x="4" y="11" width="16" height="2" rx="1" /><rect x="4" y="15" width="16" height="2" rx="1" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
    plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
    check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
    back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>,
    trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>,
};

// Stable row keys: the nth copy of a song keeps its key while rows around it
// move, so React keeps each row's element and only what changed animates.
function rowKeys(ids) {
    const seen = {};
    return ids.map(id => { seen[id] = (seen[id] ?? -1) + 1; return `${id}#${seen[id]}`; });
}

export default function QueuePanel() {
    const s = useMusicPlayer();
    const [adding, setAdding] = useState(false);
    // { from, startY, y, startScroll, scroll, h } while a row is being dragged
    // by its handle. The row follows the pointer plus however far the list
    // has scrolled underneath it since the drag began.
    const [drag, setDrag] = useState(null);
    // { key, startX, startY, dx, at, active } while a row is being swiped
    const [swipe, setSwipe] = useState(null);
    // key -> direction (-1 / 1) for rows playing their removal animation
    const [leaving, setLeaving] = useState({});
    // Just dropped a dragged row: the list re-renders in its new order, so for
    // a moment rows must jump to place rather than slide from the old offsets.
    const [dropped, setDropped] = useState(false);
    const scrollRef = useRef(null);
    const dragRef = useRef(null);
    dragRef.current = drag;
    const swipedRef = useRef(false);   // a swipe just ended: swallow its click
    const knownRef = useRef(null);     // keys already on screen (null = first render)
    const enteringRef = useRef(new Map());
    const dragging = !!drag;
    const song = currentSong(s);
    const base = s.index + 1;   // queue position of the first "Up next" row
    const upcoming = s.queue.slice(base);
    const keys = rowKeys(upcoming);
    const latestRef = useRef(null);
    latestRef.current = { keys, base };

    // New rows (added songs) fade and grow in; rows present at first render don't.
    const now = Date.now();
    if (knownRef.current) {
        for (const k of keys) if (!knownRef.current.has(k)) enteringRef.current.set(k, now + ENTER_MS);
    }
    // Not while the picker is open, so songs added there grow in on return.
    useEffect(() => { if (!adding) knownRef.current = new Set(keys); });

    // Auto-scroll while the pointer sits near an edge of the list.
    useEffect(() => {
        if (!dragging) return;
        let frame;
        const step = () => {
            const el = scrollRef.current;
            const d = dragRef.current;
            if (el && d) {
                const rect = el.getBoundingClientRect();
                const into = d.y < rect.top + EDGE_PX ? -(rect.top + EDGE_PX - d.y)
                    : d.y > rect.bottom - EDGE_PX ? d.y - (rect.bottom - EDGE_PX) : 0;
                if (into) {
                    el.scrollTop += Math.sign(into) * Math.min(EDGE_SPEED, Math.ceil(Math.abs(into) / EDGE_PX * EDGE_SPEED));
                    const scroll = el.scrollTop;
                    if (scroll !== d.scroll) setDrag(prev => prev && { ...prev, scroll });
                }
            }
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [dragging]);

    if (adding) return <AddSongs onDone={() => setAdding(false)} />;

    // Animate the row out, then remove it from the queue (looked up again by
    // key, since the queue may have moved on meanwhile).
    const removeRow = (key, dir = -1) => {
        if (leaving[key]) return;
        setLeaving(l => ({ ...l, [key]: dir }));
        setTimeout(() => {
            const { keys: current, base: b } = latestRef.current;
            const pos = current.indexOf(key);
            if (pos !== -1) removeFromQueue(b + pos);
            setLeaving(l => { const n = { ...l }; delete n[key]; return n; });
        }, LEAVE_MS);
    };

    // ── Reorder by the handle ──
    const dy = drag ? drag.y - drag.startY + (drag.scroll - drag.startScroll) : 0;
    const target = drag
        ? Math.min(upcoming.length - 1, Math.max(0, drag.from + Math.round(dy / drag.h)))
        : null;
    const startDrag = (e, from) => {
        e.stopPropagation();
        const row = e.currentTarget.closest('.fq-row');
        e.currentTarget.setPointerCapture(e.pointerId);
        const scroll = scrollRef.current?.scrollTop || 0;
        setDrag({ from, startY: e.clientY, y: e.clientY, startScroll: scroll, scroll, h: row.getBoundingClientRect().height });
    };
    const moveDrag = (e) => { if (drag) setDrag(d => ({ ...d, y: e.clientY })); };
    const endDrag = () => {
        if (!drag) return;
        if (target !== drag.from) moveInQueue(base + drag.from, base + target);
        setDrag(null);
        setDropped(true);
        setTimeout(() => setDropped(false), 60);
    };
    // Rows between the dragged one and its target slide over to make room.
    const shiftFor = (i) => {
        if (!drag) return 0;
        if (i === drag.from) return dy;
        if (drag.from < i && i <= target) return -drag.h;
        if (target <= i && i < drag.from) return drag.h;
        return 0;
    };

    // ── Swipe sideways to remove ──
    // Undecided until the pointer moves 10px: mostly sideways becomes a swipe,
    // mostly vertical is left to the list's own scrolling.
    const swipeDown = (e, key) => {
        if (drag || e.button > 0 || e.target.closest('.fq-grip, .fq-icon')) return;
        setSwipe({ key, startX: e.clientX, startY: e.clientY, dx: 0, at: performance.now(), active: false, pointerId: e.pointerId });
    };
    const swipeMove = (e) => {
        if (!swipe || e.pointerId !== swipe.pointerId) return;
        const dx = e.clientX - swipe.startX;
        const dyMove = e.clientY - swipe.startY;
        if (!swipe.active) {
            if (Math.abs(dyMove) > 10 && Math.abs(dyMove) > Math.abs(dx)) { setSwipe(null); return; }
            if (Math.abs(dx) < 10) return;
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        setSwipe(sw => sw && { ...sw, dx, active: true });
    };
    const swipeUp = () => {
        if (!swipe) return;
        if (swipe.active) {
            swipedRef.current = true;
            setTimeout(() => { swipedRef.current = false; }, 50);
            const velocity = Math.abs(swipe.dx) / Math.max(1, performance.now() - swipe.at);
            if (Math.abs(swipe.dx) > SWIPE_REMOVE_PX || (Math.abs(swipe.dx) > 40 && velocity > 0.7)) {
                removeRow(swipe.key, Math.sign(swipe.dx) || -1);
            }
        }
        setSwipe(null);
    };

    return (
        <div className="fp-queue">
            <div className="fq-head">
                <span className="fq-heading">Queue</span>
                <button className="fq-add-btn" onClick={() => setAdding(true)}>{I.plus}Add songs</button>
            </div>
            <div className="fq-scroll" ref={scrollRef}>
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
                    <div className={`fq-list${drag ? ' dragging' : ''}${dropped ? ' no-anim' : ''}`}>
                        {upcoming.map((id, i) => {
                            const key = keys[i];
                            const info = s.songs[id] || { title: 'Loading…', artist: '' };
                            const leaveDir = leaving[key];
                            const swiping = swipe?.active && swipe.key === key;
                            const entering = (enteringRef.current.get(key) || 0) > now;
                            let style;
                            if (leaveDir) style = { transform: `translateX(${leaveDir * 110}%)`, opacity: 0 };
                            else if (swiping) style = { transform: `translateX(${swipe.dx}px)`, transition: 'none' };
                            else if (shiftFor(i)) style = { transform: `translateY(${shiftFor(i)}px)` };
                            return (
                                <div
                                    key={key}
                                    className={`fq-item${leaveDir ? ' leaving' : ''}${entering ? ' entering' : ''}`}
                                >
                                    {swiping && (
                                        <div
                                            className={`fq-swipe-bg ${swipe.dx < 0 ? 'right' : 'left'}${Math.abs(swipe.dx) > SWIPE_REMOVE_PX ? ' armed' : ''}`}
                                            style={{ width: Math.abs(swipe.dx) }}
                                        >{I.trash}</div>
                                    )}
                                    <div
                                        className={`fq-row${drag?.from === i ? ' lifted' : ''}${swiping ? ' swiping' : ''}`}
                                        style={style}
                                        onPointerDown={e => swipeDown(e, key)}
                                        onPointerMove={swipeMove}
                                        onPointerUp={swipeUp}
                                        onPointerCancel={() => setSwipe(null)}
                                    >
                                        <button
                                            className="fq-main"
                                            onClick={() => { if (!swipedRef.current) playIndex(base + i); }}
                                            aria-label={`Play ${info.title}`}
                                        >
                                            <CoverArt className="fq-cover" videoId={id} />
                                            <span className="fq-text">
                                                <span className="fq-title">{info.title}</span>
                                                <span className="fq-artist">{info.artist}</span>
                                            </span>
                                        </button>
                                        <button className="fq-icon" onClick={() => removeRow(key)} aria-label={`Remove ${info.title} from the queue`} title="Remove from queue">{I.close}</button>
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
