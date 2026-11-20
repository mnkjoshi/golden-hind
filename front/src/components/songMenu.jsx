// "⋯" menu for a song: Play next, Add to queue, Add to playlist. Any list
// renders a <SongMenuButton>; the menu itself is mounted once (from the
// Topbar). It drops down from the button on wider screens and is a bottom
// sheet on phones. A short toast confirms queue actions.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { addSongsToQueue } from '../player/musicPlayer.js';
import { openPlaylistPicker } from '../player/playlists.js';
import CoverArt from './coverArt.jsx';
import Sheet, { useSheet } from './sheet.jsx';

const PHONE_MAX = 760;
const MENU_W = 220;

let state = { song: null, anchor: null, toast: null };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const openSongMenu = (song, anchorEl) => set({ song, anchor: anchorEl?.getBoundingClientRect() || null });
const closeSongMenu = () => set({ song: null, anchor: null });

let toastTimer = null;
function showToast(text) {
    clearTimeout(toastTimer);
    set({ toast: { text, id: Date.now() } });
    toastTimer = setTimeout(() => set({ toast: null }), 1800);
}

const I = {
    more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>,
    next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11M3 12h11M3 18h7" /><path d="M16 9l5 3-5 3z" fill="currentColor" /></svg>,
    queue: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13M3 12h13M3 18h9" /><path d="M17 15.5v5l4-2.5-4-2.5z" fill="currentColor" /></svg>,
    playlist: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h12M3 12h12M3 18h7M18 14v7M14.5 17.5h7" /></svg>,
};

export function SongMenuButton({ song, className = 'mx-icon-btn' }) {
    return (
        <button
            className={className}
            onClick={(e) => { e.stopPropagation(); openSongMenu(song, e.currentTarget); }}
            aria-label={`More options for ${song.title}`}
            aria-haspopup="menu"
            title="More options"
        >{I.more}</button>
    );
}

export default function SongMenu() {
    const { song, anchor, toast } = useSyncExternalStore(subscribe, () => state);
    return (
        <>
            {song && (window.innerWidth <= PHONE_MAX || !anchor
                ? <MenuSheet key={song.videoId} song={song} />
                : <MenuPopover key={song.videoId} song={song} anchor={anchor} />)}
            {toast && <div key={toast.id} className="song-menu-toast" role="status">{toast.text}</div>}
        </>
    );
}

function actions(song) {
    return [
        { key: 'next', icon: I.next, label: 'Play next', run: () => { addSongsToQueue([song], { next: true }); showToast('Playing next'); } },
        { key: 'queue', icon: I.queue, label: 'Add to queue', run: () => { addSongsToQueue([song]); showToast('Added to queue'); } },
        { key: 'playlist', icon: I.playlist, label: 'Add to playlist', run: () => openPlaylistPicker(song) },
    ];
}

function MenuPopover({ song, anchor }) {
    const ref = useRef(null);
    const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.right - MENU_W, ready: false });
    const [closing, setClosing] = useState(false);
    const close = (after) => {
        setClosing(true);
        setTimeout(() => { closeSongMenu(); if (typeof after === 'function') after(); }, 120);
    };

    // Below the button, right-aligned; flipped above it if it would run off-screen.
    useLayoutEffect(() => {
        const h = ref.current?.offsetHeight || 0;
        const below = anchor.bottom + 6;
        const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - 6 - h) : below;
        const left = Math.min(Math.max(8, anchor.right - MENU_W), window.innerWidth - MENU_W - 8);
        setPos({ top, left, ready: true, above: top < anchor.top });
    }, [anchor]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        const onScroll = () => close();
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, { capture: true });
            window.removeEventListener('resize', onScroll);
        };
    }, []);

    return (
        <>
            <div className="song-menu-scrim" onClick={() => close()} />
            <div
                ref={ref}
                className={`song-menu${pos.ready ? ' ready' : ''}${pos.above ? ' above' : ''}${closing ? ' closing' : ''}`}
                style={{ top: pos.top, left: pos.left, width: MENU_W }}
                role="menu"
                aria-label={`Options for ${song.title}`}
            >
                {actions(song).map(a => (
                    <button key={a.key} role="menuitem" onClick={() => close(a.run)}>{a.icon}{a.label}</button>
                ))}
            </div>
        </>
    );
}

function MenuSheet({ song }) {
    const sheet = useSheet(closeSongMenu);
    return (
        <Sheet sheet={sheet} role="menu" label={`Options for ${song.title}`}>
            <div className="player-sheet-head">
                <CoverArt className="player-sheet-cover" videoId={song.videoId} />
                <span className="player-meta">
                    <span className="player-title">{song.title}</span>
                    <span className="player-artist">{song.artist || song.channel || ''}</span>
                </span>
            </div>
            {actions(song).map(a => (
                <button key={a.key} className="song-menu-sheet-item" onClick={() => sheet.close(a.run)}>{a.icon}{a.label}</button>
            ))}
            <button className="player-sheet-cancel" onClick={() => sheet.close()}>Cancel</button>
        </Sheet>
    );
}
