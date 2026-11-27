// Music section — Spotify-style: Home (/music), Search (/music/search) and
// Library (/music/library). On phones the bottom tab bar switches between
// them; on desktop a pill nav at the top does. All three share one hook for
// the song library, offline copies, and actions.
import { useNavigate, useLocation, useParams } from "react-router-dom";
// eslint flags React as unused, but this project compiles JSX with the classic runtime.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import Authenticate from "../components/authenticate.jsx";
import Topbar from "../components/topbar.jsx";
import CoverArt from "../components/coverArt.jsx";
import ConfirmButton from '../components/confirmButton.jsx';
import { track } from '../utils/analytics.js';
import { SongMenuButton } from '../components/songMenu.jsx';
import '../stylesheets/music.css';
import { useMusicPlayer, playQueue, currentSong, togglePlay, cachedLibrary, reopenPlayer, addSongsToQueue } from '../player/musicPlayer.js';
import { usePlaylists, refreshPlaylists, createPlaylist, updatePlaylist, deletePlaylist, openPlaylistPicker } from '../player/playlists.js';
import { listOffline, saveOffline, removeOffline } from '../player/offlineSongs.js';

const API = 'https://ghb.mnkjoshi.ca';

// Error text from a failed request — blob responses carry the server's JSON
// error as text.
async function requestError(e, fallback) {
    let msg = e.message || fallback;
    if (e.response?.data) {
        const raw = typeof e.response.data === 'string'
            ? e.response.data
            : (typeof e.response.data.text === 'function' ? await e.response.data.text() : (e.response.data.error || ''));
        try { msg = JSON.parse(raw).error || msg; } catch { msg = raw || msg; }
    }
    return typeof msg === 'string' ? msg : fallback;
}

const auth = () => ({ user: localStorage.getItem('user'), token: localStorage.getItem('token') });

// Download one song and hand it to the browser as an MP3. Returns the saved
// title; throws on failure.
async function saveSongFile(songUrl) {
    const { user, token } = auth();
    const response = await axios.post(`${API}/music/download`, { user, token, url: songUrl }, { responseType: 'blob', timeout: 180000 });
    const titleHeader = response.headers['x-title'];
    const title = titleHeader ? decodeURIComponent(titleHeader) : 'download';
    const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'audio/mpeg' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${title}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return title;
}

const Icon = {
    play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.14a.7.7 0 0 1 1.06-.6l11 6.86a.7.7 0 0 1 0 1.2l-11 6.86a.7.7 0 0 1-1.06-.6V5.14z" /></svg>,
    shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>,
    phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 8v6m0 0-2.5-2.5M12 14l2.5-2.5M10.5 18.5h3" /></svg>,
    download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12-4-4m4 4 4-4M4 21h16" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
    heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>,
    heartFilled: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>,
    plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
    queueAdd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13M3 12h13M3 18h9" /><path d="M17 15.5v5l4-2.5-4-2.5z" fill="currentColor" /></svg>,
    playlistAdd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h12M3 12h12M3 18h7M17 14v7M13.5 17.5h7" /></svg>,
    edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>,
    trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
    savedCheck: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /><path d="m7.5 12.5 3 3 6-6.5" stroke="#0d1117" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    saveCircle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 7.5v8m0 0-3.2-3.2M12 15.5l3.2-3.2" /></svg>,
};

// ── Shared state + actions ───────────────────────────────────────────────────

function useMusicLibrary() {
    const navigate = useNavigate();
    const { user, token } = auth();
    // Start from the last known list so pages never flash empty.
    const [library, setLibrary] = useState(() => { const c = cachedLibrary(); return c.length ? c : null; });
    const [offlineIds, setOfflineIds] = useState(() => new Set());
    const [offlineBusy, setOfflineBusy] = useState(null); // videoId | 'all'
    const [zipBusy, setZipBusy] = useState(false);
    const [rowBusy, setRowBusy] = useState(null);
    const [status, setStatus] = useState('');
    const player = useMusicPlayer();
    const playing = currentSong(player);

    const loadLibrary = () => axios.post(`${API}/music/library`, { user, token })
        .then(r => {
            const list = r.data?.songs || [];
            setLibrary(list);
            try { localStorage.setItem('musicLibraryCache', JSON.stringify(list)); } catch { /* quota */ }
        })
        .catch(() => setLibrary(prev => prev || cachedLibrary())); // offline: last known list

    useEffect(() => {
        if (!user) return;
        Authenticate(user, token, navigate);
        loadLibrary();
        listOffline().then(setOfflineIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const flash = (msg, ms = 8000) => { setStatus(msg); if (ms) setTimeout(() => setStatus(s => (s === msg ? '' : s)), ms); };

    // Play `list` from `index`; tapping the loaded song just toggles it.
    const playFrom = (list, index) => {
        if (!list?.length) return;
        if (playing?.videoId === list[index].videoId && player.queue.length === list.length) return togglePlay();
        playQueue(list, index);
    };
    // Add to the end of the queue (or start playing them if nothing is queued).
    const queueSongs = (songs) => {
        if (!songs?.length) return;
        const wasEmpty = !player.queue.length;
        addSongsToQueue(songs);
        if (!wasEmpty) flash(songs.length === 1 ? `Added "${songs[0].title}" to the queue` : `Added ${songs.length} songs to the queue`, 2500);
    };
    const queueSong = (song) => queueSongs([song]);
    const shufflePlay = (list) => {
        if (!list?.length) return;
        playQueue(list, Math.floor(Math.random() * list.length), { shuffle: true });
    };

    const toggleOffline = async (song) => {
        if (offlineBusy) return;
        if (offlineIds.has(song.videoId)) {
            await removeOffline(song.videoId);
            setOfflineIds(prev => { const n = new Set(prev); n.delete(song.videoId); return n; });
            return;
        }
        setOfflineBusy(song.videoId);
        try {
            await saveOffline(song.videoId);
            setOfflineIds(prev => new Set(prev).add(song.videoId));
        } catch (e) {
            flash(e.message || 'Could not save this song to the device');
        } finally {
            setOfflineBusy(null);
        }
    };

    const saveAllOffline = async () => {
        if (offlineBusy || !library?.length) return;
        const pending = library.filter(s => !offlineIds.has(s.videoId));
        setOfflineBusy('all');
        let failed = 0;
        for (let i = 0; i < pending.length; i++) {
            setStatus(`Saving to this device ${i + 1} of ${pending.length}: ${pending[i].title}`);
            try {
                await saveOffline(pending[i].videoId);
                setOfflineIds(prev => new Set(prev).add(pending[i].videoId));
            } catch (e) {
                failed++;
                if (e?.name === 'QuotaExceededError') { flash('This device is out of storage for offline songs.'); break; }
            }
        }
        setOfflineBusy(null);
        flash(failed ? `${failed} song${failed === 1 ? '' : 's'} couldn't be saved to this device.` : 'All songs are saved on this device — they play without a connection.');
    };

    // Every song as one ZIP; prepares any the server doesn't hold yet.
    const downloadZip = async () => {
        if (!library?.length || zipBusy) return;
        setZipBusy(true);
        const pending = library.filter(s => !s.cached);
        let failed = 0;
        for (let i = 0; i < pending.length; i++) {
            setStatus(`Preparing ${i + 1} of ${pending.length}: ${pending[i].title}`);
            try {
                await axios.post(`${API}/music/cache`, { user, token, videoId: pending[i].videoId }, { timeout: 180000 });
                setLibrary(prev => prev.map(s => (s.videoId === pending[i].videoId ? { ...s, cached: true } : s)));
            } catch {
                failed++;
            }
        }
        flash(failed ? `${failed} song${failed === 1 ? '' : 's'} couldn't be prepared and will be left out. Starting download…` : 'Starting download…', failed ? 12000 : 4000);
        const a = document.createElement('a');
        a.href = `${API}/music/library/zip?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setZipBusy(false);
    };

    const downloadSong = async (song) => {
        if (rowBusy) return;
        setRowBusy(song.videoId);
        try {
            await saveSongFile(`https://www.youtube.com/watch?v=${song.videoId}`);
        } catch (e) {
            flash(await requestError(e, 'Download failed'));
        } finally {
            setRowBusy(null);
        }
    };

    const removeSong = (song) => {
        setLibrary(prev => prev.filter(s => s.videoId !== song.videoId));
        axios.post(`${API}/music/library/remove`, { user, token, videoId: song.videoId }).catch(() => loadLibrary());
    };

    const isSaved = (videoId) => !!library?.some(s => s.videoId === videoId);
    const toggleSaved = (r) => {
        if (isSaved(r.videoId)) return removeSong(r);
        setLibrary(prev => [{ videoId: r.videoId, title: r.title, artist: r.channel || r.artist || '', thumbnail: r.thumbnail, cached: false, addedAt: Date.now() }, ...(prev || [])]);
        axios.post(`${API}/music/library/add`, { user, token, song: { videoId: r.videoId, title: r.title, artist: r.channel || r.artist } })
            .catch(() => loadLibrary());
    };

    return {
        user, library, loadLibrary, offlineIds, offlineBusy, zipBusy, rowBusy, status, player, playing,
        playFrom, shufflePlay, queueSong, queueSongs, toggleOffline, saveAllOffline, downloadZip, downloadSong, removeSong, isSaved, toggleSaved,
    };
}

function useArtists(library) {
    return useMemo(() => {
        const byArtist = new Map();
        for (const s of library) {
            const name = (s.artist || '').trim();
            if (!name) continue;
            if (!byArtist.has(name)) byArtist.set(name, []);
            byArtist.get(name).push(s);
        }
        return [...byArtist.entries()]
            .map(([name, songs]) => ({ name, songs }))
            .filter(a => a.songs.length > 1)
            .sort((a, b) => b.songs.length - a.songs.length)
            .slice(0, 10);
    }, [library]);
}

// Desktop pill nav (phones use the bottom tab bar instead).
function MusicNav() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const tabs = [['/music', 'Home'], ['/music/search', 'Search'], ['/music/library', 'Library'], ['/music/playlists', 'Playlists']];
    const activeTab = pathname.startsWith('/music/playlist') ? '/music/playlists' : pathname;
    return (
        <div className="mx-nav">
            {tabs.map(([path, label]) => (
                <button key={path} className={activeTab === path ? 'active' : ''} onClick={() => navigate(path)}>{label}</button>
            ))}
        </div>
    );
}

function Shell({ children }) {
    const { pathname } = useLocation();
    useEffect(() => { track('music_view', { page: pathname }); }, [pathname]);
    return (
        <div className="music-page">
            <Topbar />
            <div className="music-content">
                <MusicNav />
                {children}
            </div>
        </div>
    );
}

// Press and hold (mouse or finger) without moving: calls onLongPress, and
// the click that ends that press is swallowed so it doesn't also play.
const LONG_PRESS_MS = 450;
function useLongPress(onLongPress) {
    const timer = useRef(null);
    const start = useRef(null);
    const fired = useRef(false);
    const clear = () => { clearTimeout(timer.current); timer.current = null; };
    useEffect(() => clear, []);
    if (!onLongPress) return { handlers: {}, consumeClick: () => false };
    return {
        handlers: {
            onPointerDown: (e) => {
                if (e.button > 0) return;
                fired.current = false;
                start.current = { x: e.clientX, y: e.clientY };
                clear();
                timer.current = setTimeout(() => {
                    timer.current = null;
                    fired.current = true;
                    try { navigator.vibrate?.(12); } catch { /* unsupported */ }
                    onLongPress();
                }, LONG_PRESS_MS);
            },
            onPointerMove: (e) => {
                if (timer.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
            },
            onPointerUp: clear,
            onPointerLeave: clear,
            onPointerCancel: clear,
            // A held finger on phones would otherwise open the browser's menu.
            onContextMenu: (e) => { if (fired.current || timer.current) e.preventDefault(); },
        },
        consumeClick: () => {
            if (!fired.current) return false;
            fired.current = false;
            return true;
        },
    };
}

// One row in a song list: cover, title/artist, now-playing indicator. With
// onLongPress, holding the row starts selecting; while `selecting`, a tap
// calls onPlay (the list toggles the song) and a checkmark replaces the actions.
function SongRow({ song, isPlaying, playingNow, onPlay, onLongPress, selecting = false, selected = false, children }) {
    const press = useLongPress(onLongPress);
    return (
        <div className={`mx-row${isPlaying ? ' playing' : ''}${selecting ? ' selecting' : ''}${selected ? ' selected' : ''}`}>
            <button
                className="mx-row-main"
                onClick={(e) => { if (!press.consumeClick()) onPlay(e); }}
                aria-label={selecting ? `${selected ? 'Deselect' : 'Select'} ${song.title}` : `Play ${song.title}`}
                aria-pressed={selecting ? selected : undefined}
                {...press.handlers}
            >
                {onLongPress && (
                    <span className="mx-row-check" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12.5 4 4L18 8.5" /></svg>
                    </span>
                )}
                <CoverArt className="mx-row-cover" videoId={song.videoId} />
                <span className="mx-row-text">
                    <span className="mx-row-title">
                        {isPlaying && playingNow && <span className="music-eq" aria-hidden="true"><i /><i /><i /></span>}
                        {song.title}
                    </span>
                    {(song.artist || song.channel) && <span className="mx-row-artist">{song.artist || song.channel}</span>}
                </span>
            </button>
            {children && <div className="mx-row-actions" aria-hidden={selecting || undefined}>{children}</div>}
        </div>
    );
}

// ── Home ─────────────────────────────────────────────────────────────────────

// Recommendations for people who listen a lot (the server decides who
// qualifies and rebuilds them at most once a day). Everyone else gets
// { eligible: false } and the shelves simply don't appear.
function useMusicRecs() {
    const [recs, setRecs] = useState(null);
    useEffect(() => {
        const { user, token } = auth();
        if (!user || !token) return;
        let retry;
        const load = (again) => axios.post(`${API}/music/recommendations`, { user, token })
            .then(r => {
                setRecs(r.data);
                // First build runs in the background on the server; look once more.
                if (again && r.data?.building) retry = setTimeout(() => load(false), 30000);
            })
            .catch(() => {});
        load(true);
        return () => clearTimeout(retry);
    }, []);
    return recs?.eligible ? recs : null;
}

function RecShelf({ title, songs, m }) {
    if (!songs?.length) return null;
    return (
        <section className="mx-section">
            <div className="mx-section-head">
                <h2>{title}</h2>
                <button onClick={() => m.playFrom(songs, 0)}>Play all</button>
            </div>
            <div className="mx-shelf">
                {songs.map((s, i) => (
                    <div key={s.videoId} className="mx-card mx-rec-card">
                        <button className="mx-rec-play" onClick={() => m.playFrom(songs, i)} aria-label={`Play ${s.title}`}>
                            <CoverArt className="mx-card-cover" videoId={s.videoId} />
                            <span className="mx-card-title">{s.title}</span>
                            <span className="mx-card-sub">{s.artist}</span>
                        </button>
                        <SongMenuButton song={s} className="mx-rec-more" />
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function MusicHome() {
    const navigate = useNavigate();
    const m = useMusicLibrary();
    const library = m.library || [];
    const artists = useArtists(library);
    const recs = useMusicRecs();
    if (!m.user) { navigate('/auth'); return null; }

    const hour = new Date().getHours();
    const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const recent = library.slice(0, 12);
    const now = m.playing;

    return (
        <Shell>
            <h1 className="mx-greeting">{greeting}</h1>

            {m.library === null ? (
                <div className="music-results-state"><div className="music-spinner" /><span>Loading your music…</span></div>
            ) : library.length === 0 ? (
                <div className="mx-empty">
                    <p>Your library is empty. Find something to listen to.</p>
                    <button className="mx-cta" onClick={() => navigate('/music/search')}>Search music</button>
                </div>
            ) : (
                <>
                    <div className="mx-quick">
                        <button className="mx-quick-play" onClick={() => m.shufflePlay(library)}>{Icon.shuffle}Shuffle My Songs</button>
                        <button className="mx-quick-secondary" onClick={() => m.playFrom(library, 0)}>{Icon.play}Play</button>
                    </div>

                    {now && (
                        <button className="mx-jump" onClick={reopenPlayer}>
                            <CoverArt className="mx-jump-cover" videoId={now.videoId} />
                            <span className="mx-jump-text">
                                <span className="mx-jump-label">Jump back in</span>
                                <span className="mx-jump-title">{now.title}</span>
                                <span className="mx-jump-artist">{now.artist}</span>
                            </span>
                        </button>
                    )}

                    {recs && (
                        <>
                            <RecShelf
                                title={recs.because ? `Because you play ${recs.because.artist || recs.because.title}` : 'Picked for you'}
                                songs={recs.favourites}
                                m={m}
                            />
                            <RecShelf title="Fresh picks" songs={recs.recent} m={m} />
                        </>
                    )}

                    <section className="mx-section">
                        <div className="mx-section-head">
                            <h2>Recently added</h2>
                            <button onClick={() => navigate('/music/library')}>Show all</button>
                        </div>
                        <div className="mx-shelf">
                            {recent.map((s, i) => (
                                <button key={s.videoId} className="mx-card" onClick={() => m.playFrom(library, i)}>
                                    <CoverArt className="mx-card-cover" videoId={s.videoId} />
                                    <span className="mx-card-title">{s.title}</span>
                                    <span className="mx-card-sub">{s.artist}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {artists.length > 0 && (
                        <section className="mx-section">
                            <div className="mx-section-head"><h2>Your top artists</h2></div>
                            <div className="mx-shelf">
                                {artists.map(a => (
                                    <button key={a.name} className="mx-card mx-artist" onClick={() => m.shufflePlay(a.songs)}>
                                        <CoverArt className="mx-card-cover round" videoId={a.songs[0].videoId} />
                                        <span className="mx-card-title">{a.name}</span>
                                        <span className="mx-card-sub">{a.songs.length} songs</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </Shell>
    );
}

// ── Search ───────────────────────────────────────────────────────────────────

export function MusicSearch() {
    const navigate = useNavigate();
    const m = useMusicLibrary();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [searchedFor, setSearchedFor] = useState('');
    // MP3 download queue (search results or pasted links → files on this device)
    const [queue, setQueue] = useState([]);
    const [qStatus, setQStatus] = useState('idle'); // idle | working | done | error
    const [qLabel, setQLabel] = useState('');
    const [qError, setQError] = useState('');

    useEffect(() => { inputRef.current?.focus(); }, []);
    if (!m.user) { navigate('/auth'); return null; }

    const ytPattern = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/).+/;
    const inputIsUrl = ytPattern.test(query.trim());
    const q = query.trim().toLowerCase();
    const inLibrary = q.length >= 2 && !inputIsUrl
        ? (m.library || []).filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(q)).slice(0, 6)
        : [];

    const runSearch = async () => {
        const text = query.trim();
        if (!text || searching) return;
        if (inputIsUrl) {
            if (!queue.some(x => x.url === text)) setQueue(prev => [...prev, { url: text, id: Date.now() }]);
            setQuery('');
            return;
        }
        setSearching(true);
        setSearchError('');
        setSearchedFor(text);
        try {
            const { user, token } = auth();
            const res = await axios.post(`${API}/music/search`, { user, token, query: text }, { timeout: 40000 });
            setResults(res.data?.results || []);
        } catch (e) {
            setResults([]);
            setSearchError(e.response?.data?.error || 'Search failed. Try again in a moment.');
        } finally {
            setSearching(false);
        }
    };

    const queueResult = (r) => {
        if (queue.some(x => x.url === r.url)) return;
        setQueue(prev => [...prev, { url: r.url, id: Date.now(), title: r.title, channel: r.channel, thumbnail: r.thumbnail }]);
        if (qStatus === 'done') setQStatus('idle');
    };

    const downloadQueue = async () => {
        if (!queue.length) return;
        setQStatus('working');
        setQError('');
        for (const item of queue) {
            try {
                setQLabel(`Downloading: ${item.title || item.url}`);
                await saveSongFile(item.url);
            } catch (e) {
                setQError(await requestError(e, 'Download failed'));
                setQStatus('error');
                m.loadLibrary();
                return;
            }
        }
        setQueue([]);
        setQStatus('done');
        m.loadLibrary(); // downloads are added to My Songs server-side
    };

    // Playing a YouTube result plays just that song (it streams via the
    // server, which fetches it the first time).
    const playResult = (r) => playQueue([{ videoId: r.videoId, title: r.title, artist: r.channel || '', thumbnail: r.thumbnail }], 0);

    return (
        <Shell>
            <h1 className="mx-page-title">Search</h1>
            <div className="mx-search">
                <svg className="mx-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" /></svg>
                <input
                    ref={inputRef}
                    type="search"
                    enterKeyHint="search"
                    className="mx-search-input"
                    placeholder="What do you want to listen to?"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runSearch()}
                />
                {query && <button className="mx-search-clear" onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }} aria-label="Clear">{Icon.close}</button>}
            </div>
            {inputIsUrl && <div className="mx-hint">Press Enter to add this link to your download queue.</div>}

            {inLibrary.length > 0 && (
                <section className="mx-section">
                    <h2 className="mx-subhead">In your library</h2>
                    <div className="mx-list">
                        {inLibrary.map((s, i) => (
                            <SongRow
                                key={s.videoId}
                                song={s}
                                isPlaying={m.playing?.videoId === s.videoId}
                                playingNow={!m.player.paused}
                                onPlay={() => m.playFrom(inLibrary, i)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {(searching || results !== null) && (
                <section className="mx-section">
                    {searching ? (
                        <div className="music-results-state"><div className="music-spinner" /><span>Searching for “{searchedFor}”…</span></div>
                    ) : searchError ? (
                        <div className="music-results-state error">{searchError}</div>
                    ) : results.length === 0 ? (
                        <div className="music-results-state">No results for “{searchedFor}”.</div>
                    ) : (
                        <>
                            <h2 className="mx-subhead">Songs</h2>
                            <div className="mx-list">
                                {results.map(r => {
                                    const saved = m.isSaved(r.videoId);
                                    const queued = queue.some(x => x.url === r.url);
                                    return (
                                        <SongRow
                                            key={r.videoId}
                                            song={{ ...r, artist: r.channel }}
                                            isPlaying={m.playing?.videoId === r.videoId}
                                            playingNow={!m.player.paused}
                                            onPlay={() => playResult(r)}
                                        >
                                            {r.official && <span className="music-result-official mx-official">Official</span>}
                                            <button className={`mx-icon-btn${saved ? ' on' : ''}`} onClick={() => m.toggleSaved(r)} aria-label={saved ? 'Remove from library' : 'Save to library'} title={saved ? 'In your library' : 'Save to your library'}>
                                                {saved ? Icon.heartFilled : Icon.heart}
                                            </button>
                                            <button className="mx-icon-btn" onClick={() => openPlaylistPicker({ videoId: r.videoId, title: r.title, artist: r.channel })} aria-label="Add to playlist" title="Add to playlist">
                                                {Icon.playlistAdd}
                                            </button>
                                            <button className={`mx-icon-btn mx-desktop${queued ? ' on' : ''}`} onClick={() => queueResult(r)} disabled={queued || qStatus === 'working'} aria-label="Add to download queue" title="Add to MP3 download queue">
                                                {Icon.plus}
                                            </button>
                                        </SongRow>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </section>
            )}

            {queue.length > 0 && (
                <div className="music-queue-card mx-section">
                    <div className="music-queue-header">
                        <span className="music-queue-title">Download queue ({queue.length})</span>
                        {qStatus !== 'working' && <button className="music-clear-btn" onClick={() => setQueue([])}>Clear all</button>}
                    </div>
                    <div className="music-queue-list">
                        {queue.map(item => (
                            <div key={item.id} className="music-queue-item">
                                {item.thumbnail ? <img className="music-queue-thumb" src={item.thumbnail} alt="" /> : <span className="music-queue-icon">{Icon.download}</span>}
                                <span className="music-queue-url music-queue-named">
                                    <span className="music-queue-name">{item.title || item.url}</span>
                                    {item.channel && <span className="music-queue-channel">{item.channel}</span>}
                                </span>
                                {qStatus !== 'working' && (
                                    <button className="music-queue-remove" onClick={() => setQueue(prev => prev.filter(x => x.id !== item.id))} aria-label="Remove">{Icon.close}</button>
                                )}
                            </div>
                        ))}
                    </div>
                    {qStatus === 'working' ? (
                        <div className="music-progress-section"><div className="music-progress-label"><div className="music-spinner" /><span>{qLabel}</span></div></div>
                    ) : (
                        <button className="music-download-btn" onClick={downloadQueue}>
                            {Icon.download}Download {queue.length > 1 ? `${queue.length} MP3s` : 'MP3'}
                        </button>
                    )}
                    {qStatus === 'error' && <div className="music-status error"><span>{qError}</span></div>}
                </div>
            )}
            {qStatus === 'done' && <div className="music-status success mx-section"><span>Downloaded — the songs are in your library too.</span></div>}
        </Shell>
    );
}

// ── Library ──────────────────────────────────────────────────────────────────

const SORTS = {
    recent: { label: 'Recently added', fn: (a, b) => (b.addedAt || 0) - (a.addedAt || 0) },
    title: { label: 'Title', fn: (a, b) => a.title.localeCompare(b.title) },
    artist: { label: 'Artist', fn: (a, b) => (a.artist || '').localeCompare(b.artist || '') || a.title.localeCompare(b.title) },
};

export function MusicLibrary() {
    const navigate = useNavigate();
    const m = useMusicLibrary();
    const [sort, setSort] = useState(() => localStorage.getItem('musicLibrarySort') || 'recent');
    const [onlyDownloaded, setOnlyDownloaded] = useState(false);
    // Long-press selection: null = not selecting, else the selected videoIds.
    // The bar keeps the last count while it slides away.
    const [selected, setSelected] = useState(null);
    const lastCount = useRef(0);
    if (selected) lastCount.current = selected.size;
    const isSelecting = !!selected;
    useEffect(() => {
        if (!isSelecting) return;
        const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isSelecting]);
    const list = useMemo(() => {
        const all = [...(m.library || [])].sort((SORTS[sort] || SORTS.recent).fn);
        return onlyDownloaded ? all.filter(s => m.offlineIds.has(s.videoId)) : all;
    }, [m.library, sort, onlyDownloaded, m.offlineIds]);
    if (!m.user) { navigate('/auth'); return null; }

    const changeSort = (v) => { setSort(v); try { localStorage.setItem('musicLibrarySort', v); } catch { /* noop */ } };
    const onDevice = (m.library || []).filter(s => m.offlineIds.has(s.videoId)).length;
    const toggleSelected = (id) => setSelected(prev => {
        const next = new Set(prev || []);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next.size ? next : null;
    });
    const selectedSongs = () => list.filter(s => selected?.has(s.videoId));

    return (
        <Shell>
            <div className="mx-lib-head">
                <h1 className="mx-page-title">Your Library</h1>
                <span className="mx-lib-count">{m.library ? `${m.library.length} songs · ${onDevice} on this device` : ''}</span>
            </div>

            {m.library?.length > 0 && (
                <>
                    <div className="mx-actions">
                        <button className="mx-action primary" onClick={() => m.playFrom(list, 0)}>{Icon.play}<span>Play</span></button>
                        <button className="mx-action" onClick={() => m.shufflePlay(list)}>{Icon.shuffle}<span>Shuffle</span></button>
                        <button className="mx-action" onClick={m.saveAllOffline} disabled={!!m.offlineBusy} title="Save every song onto this device for offline listening">
                            {Icon.phone}<span>{m.offlineBusy === 'all' ? 'Saving…' : 'To this device'}</span>
                        </button>
                        <button className="mx-action" onClick={m.downloadZip} disabled={m.zipBusy} title="Download every song as MP3 files in one ZIP">
                            {Icon.download}<span>{m.zipBusy ? 'Preparing…' : 'ZIP'}</span>
                        </button>
                    </div>
                    <div className="mx-filters">
                        <button className={`mx-chip${onlyDownloaded ? ' on' : ''}`} onClick={() => setOnlyDownloaded(v => !v)}>Downloaded</button>
                        <select className="mx-sort" value={sort} onChange={e => changeSort(e.target.value)} aria-label="Sort">
                            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                </>
            )}

            {m.status && <div className="music-library-status">{(m.zipBusy || m.offlineBusy === 'all') && <div className="music-spinner" />}<span>{m.status}</span></div>}

            {m.library === null ? (
                <div className="music-results-state"><div className="music-spinner" /><span>Loading your songs…</span></div>
            ) : m.library.length === 0 ? (
                <div className="mx-empty">
                    <p>Songs you save or download show up here.</p>
                    <button className="mx-cta" onClick={() => navigate('/music/search')}>Find music</button>
                </div>
            ) : list.length === 0 ? (
                <div className="music-results-state">Nothing downloaded to this device yet.</div>
            ) : (
                <div className={`mx-list${selected ? ' selecting' : ''}`}>
                    {list.map((s, i) => (
                        <SongRow
                            key={s.videoId}
                            song={s}
                            isPlaying={m.playing?.videoId === s.videoId}
                            playingNow={!m.player.paused}
                            onPlay={() => (selected ? toggleSelected(s.videoId) : m.playFrom(list, i))}
                            onLongPress={() => (selected ? toggleSelected(s.videoId) : setSelected(new Set([s.videoId])))}
                            selecting={!!selected}
                            selected={!!selected?.has(s.videoId)}
                        >
                            <button
                                className={`mx-icon-btn${m.offlineIds.has(s.videoId) ? ' on' : ''}`}
                                onClick={() => m.toggleOffline(s)}
                                disabled={!!m.offlineBusy}
                                aria-label={m.offlineIds.has(s.videoId) ? `Remove ${s.title} from this device` : `Save ${s.title} to this device`}
                                title={m.offlineIds.has(s.videoId) ? 'On this device — tap to remove' : 'Save to this device for offline'}
                            >
                                {m.offlineBusy === s.videoId ? <div className="music-spinner" /> : m.offlineIds.has(s.videoId) ? Icon.savedCheck : Icon.saveCircle}
                            </button>
                            <SongMenuButton song={s} />
                            <button className="mx-icon-btn mx-desktop" onClick={() => m.downloadSong(s)} disabled={!!m.rowBusy} aria-label={`Download ${s.title}`} title="Download MP3">
                                {m.rowBusy === s.videoId ? <div className="music-spinner" /> : Icon.download}
                            </button>
                            <ConfirmButton className="mx-icon-btn" onConfirm={() => m.removeSong(s)} message="Remove from your library?" aria-label={`Remove ${s.title}`} title="Remove from library">{Icon.close}</ConfirmButton>
                        </SongRow>
                    ))}
                </div>
            )}
            <div className={`mx-select-bar${selected ? ' open' : ''}`} role="toolbar" aria-label="Selected songs" aria-hidden={!selected}>
                <button className="mx-select-close" onClick={() => setSelected(null)} aria-label="Stop selecting" tabIndex={selected ? 0 : -1}>{Icon.close}</button>
                <span className="mx-select-count">{lastCount.current} selected</span>
                <button
                    className="mx-select-action"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => { m.queueSongs(selectedSongs()); setSelected(null); }}
                >{Icon.queueAdd}<span>Add to queue</span></button>
                <button
                    className="mx-select-action primary"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => { openPlaylistPicker(selectedSongs()); setSelected(null); }}
                >{Icon.playlistAdd}<span>Add to playlist</span></button>
            </div>
        </Shell>
    );
}

// ── Playlists ───────────────────────────────────────────────────────────────

export function MusicPlaylists() {
    const navigate = useNavigate();
    const m = useMusicLibrary();
    const { playlists } = usePlaylists();
    const [newName, setNewName] = useState(null); // null = not creating
    useEffect(() => { refreshPlaylists(); }, []);
    if (!m.user) { navigate('/auth'); return null; }

    const createNew = async () => {
        const n = (newName || '').trim();
        if (!n) return;
        const id = await createPlaylist(n);
        setNewName(null);
        navigate(`/music/playlist/${id}`);
    };

    return (
        <Shell>
            <div className="mx-lib-head">
                <h1 className="mx-page-title">Playlists</h1>
                <span className="mx-lib-count">{playlists ? `${playlists.length} playlist${playlists.length === 1 ? '' : 's'}` : ''}</span>
            </div>
                <div className="mx-playlists">
                    {newName === null ? (
                        <button className="mx-pl-new" onClick={() => setNewName('')}>
                            <span className="mx-pl-new-icon">{Icon.plus}</span>New playlist
                        </button>
                    ) : (
                        <div className="mx-pl-create">
                            <input autoFocus maxLength={60} placeholder="Playlist name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createNew(); if (e.key === 'Escape') setNewName(null); }} />
                            <button onClick={createNew} disabled={!newName.trim()}>Create</button>
                            <button className="secondary" onClick={() => setNewName(null)}>Cancel</button>
                        </div>
                    )}
                    {Object.entries(AUTO_PLAYLISTS).map(([autoId, a]) => (
                        <button key={autoId} className="mx-pl-row" onClick={() => navigate(`/music/playlist/${autoId}`)}>
                            <AutoCover icon={a.icon} className="mx-pl-cover" />
                            <span className="mx-row-text">
                                <span className="mx-row-title">{a.name}</span>
                                <span className="mx-row-artist">Automatic playlist</span>
                            </span>
                        </button>
                    ))}
                    {(playlists || []).map(p => (
                        <button key={p.id} className="mx-pl-row" onClick={() => navigate(`/music/playlist/${p.id}`)}>
                            <PlaylistCover songs={p.songs} className="mx-pl-cover" />
                            <span className="mx-row-text">
                                <span className="mx-row-title">{p.name}</span>
                                <span className="mx-row-artist">Playlist · {p.songs.length} song{p.songs.length === 1 ? '' : 's'}</span>
                            </span>
                        </button>
                    ))}
                    {playlists && playlists.length === 0 && newName === null && (
                        <div className="mx-empty"><p>No playlists yet. Make one, then add songs from your library or search.</p></div>
                    )}
                </div>
        </Shell>
    );
}

// "← Playlists" at the top of a playlist page.
function BackToPlaylists() {
    const navigate = useNavigate();
    return (
        <button className="mx-back" onClick={() => navigate('/music/playlists')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Playlists
        </button>
    );
}

// 2×2 mosaic of the first four songs (or one cover), like Spotify.
function PlaylistCover({ songs, className }) {
    const ids = (songs || []).slice(0, 4);
    if (ids.length === 0) {
        return <div className={`${className} mx-pl-cover-empty`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg></div>;
    }
    if (ids.length < 4) return <CoverArt className={className} videoId={ids[0]} />;
    return (
        <div className={`${className} mx-pl-mosaic`}>
            {ids.map(id => <CoverArt key={id} className="mx-pl-mosaic-cell" videoId={id} />)}
        </div>
    );
}

// ── One playlist ─────────────────────────────────────────────────────────────

// Automatic playlists built from listening history (/music/history).
const AUTO_PLAYLISTS = {
    'recently-played': { name: 'Recently played', key: 'recent', icon: 'clock', empty: 'Songs you play show up here.' },
    'most-played': { name: 'Most played', key: 'most', icon: 'flame', empty: 'Your most-played songs show up here once you listen for a while.' },
};
const AUTO_ICONS = {
    clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
    flame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.3 1.6 1 2.6 2 3 0-3 .2-5.6.8-8.2z" /></svg>,
};
function AutoCover({ icon, className }) {
    return <div className={`${className} mx-auto-cover mx-auto-${icon}`}>{AUTO_ICONS[icon]}</div>;
}

export function MusicPlaylist() {
    const { id } = useParams();
    return AUTO_PLAYLISTS[id] ? <AutoPlaylist key={id} id={id} /> : <UserPlaylist />;
}

function AutoPlaylist({ id }) {
    const navigate = useNavigate();
    const m = useMusicLibrary();
    const def = AUTO_PLAYLISTS[id];
    const [songs, setSongs] = useState(null);
    useEffect(() => {
        const { user, token } = auth();
        if (!user || !token) return;
        axios.post(`${API}/music/history`, { user, token })
            .then(r => setSongs(r.data?.[def.key] || []))
            .catch(() => setSongs([]));
    }, [def.key]);
    if (!m.user) { navigate('/auth'); return null; }
    const list = songs || [];

    return (
        <Shell>
            <BackToPlaylists />
            <div className="mx-pl-hero">
                <AutoCover icon={def.icon} className="mx-pl-hero-cover" />
                <div className="mx-pl-hero-text">
                    <span className="mx-pl-hero-label">Automatic playlist</span>
                    <h1 className="mx-page-title mx-pl-name">{def.name}</h1>
                    <span className="mx-lib-count">{songs === null ? '' : `${list.length} song${list.length === 1 ? '' : 's'}`}</span>
                </div>
            </div>
            <div className="mx-actions">
                <button className="mx-action primary" onClick={() => m.playFrom(list, 0)} disabled={!list.length}>{Icon.play}<span>Play</span></button>
                <button className="mx-action" onClick={() => m.shufflePlay(list)} disabled={!list.length}>{Icon.shuffle}<span>Shuffle</span></button>
                <button className="mx-action" onClick={() => m.queueSongs(list)} disabled={!list.length}>{Icon.queueAdd}<span>Queue all</span></button>
            </div>
            {songs === null ? (
                <div className="music-results-state"><div className="music-spinner" /><span>Loading…</span></div>
            ) : list.length === 0 ? (
                <div className="mx-empty"><p>{def.empty}</p></div>
            ) : (
                <div className="mx-list">
                    {list.map((s, i) => (
                        <SongRow key={s.videoId} song={s} isPlaying={m.playing?.videoId === s.videoId} playingNow={!m.player.paused} onPlay={() => m.playFrom(list, i)}>
                            <SongMenuButton song={s} />
                        </SongRow>
                    ))}
                </div>
            )}
        </Shell>
    );
}

function UserPlaylist() {
    const navigate = useNavigate();
    const { id } = useParams();
    const m = useMusicLibrary();
    const { playlists } = usePlaylists();
    const [renaming, setRenaming] = useState(null);
    useEffect(() => { refreshPlaylists(); }, []);
    const playlist = (playlists || []).find(p => p.id === id);
    const byId = useMemo(() => new Map((m.library || []).map(s => [s.videoId, s])), [m.library]);
    const songs = useMemo(
        () => (playlist?.songs || []).map(v => byId.get(v) || { videoId: v, title: 'Unknown song', artist: '' }),
        [playlist, byId]
    );
    if (!m.user) { navigate('/auth'); return null; }

    if (!playlist) {
        return (
            <Shell>
                <div className="mx-empty">
                    <p>{playlists === null ? 'Loading…' : 'This playlist no longer exists.'}</p>
                    {playlists !== null && <button className="mx-cta" onClick={() => navigate('/music/playlists')}>Back to Playlists</button>}
                </div>
            </Shell>
        );
    }

    const removeFromPlaylist = (videoId) => updatePlaylist(playlist.id, { songs: playlist.songs.filter(v => v !== videoId) });
    const rename = () => {
        const n = (renaming || '').trim();
        if (n && n !== playlist.name) updatePlaylist(playlist.id, { name: n });
        setRenaming(null);
    };
    const remove = async () => {
        if (!window.confirm(`Delete “${playlist.name}”? The songs stay in your library.`)) return;
        await deletePlaylist(playlist.id);
        navigate('/music/playlists');
    };

    return (
        <Shell>
            <BackToPlaylists />
            <div className="mx-pl-hero">
                <PlaylistCover songs={playlist.songs} className="mx-pl-hero-cover" />
                <div className="mx-pl-hero-text">
                    <span className="mx-pl-hero-label">Playlist</span>
                    {renaming === null ? (
                        <h1 className="mx-page-title mx-pl-name" onClick={() => setRenaming(playlist.name)} title="Rename">{playlist.name}</h1>
                    ) : (
                        <input className="mx-pl-rename" autoFocus maxLength={60} value={renaming} onChange={e => setRenaming(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(null); }} />
                    )}
                    <span className="mx-lib-count">{songs.length} song{songs.length === 1 ? '' : 's'}</span>
                </div>
            </div>

            <div className="mx-actions">
                <button className="mx-action primary" onClick={() => m.playFrom(songs, 0)} disabled={!songs.length}>{Icon.play}<span>Play</span></button>
                <button className="mx-action" onClick={() => m.shufflePlay(songs)} disabled={!songs.length}>{Icon.shuffle}<span>Shuffle</span></button>
                <button className="mx-action" onClick={() => setRenaming(playlist.name)}>{Icon.edit}<span>Rename</span></button>
                <button className="mx-action" onClick={remove}>{Icon.trash}<span>Delete</span></button>
            </div>

            {songs.length === 0 ? (
                <div className="mx-empty">
                    <p>Add songs with the playlist button in your library or search.</p>
                    <button className="mx-cta" onClick={() => navigate('/music/search')}>Find music</button>
                </div>
            ) : (
                <div className="mx-list">
                    {songs.map((s, i) => (
                        <SongRow key={s.videoId} song={s} isPlaying={m.playing?.videoId === s.videoId} playingNow={!m.player.paused} onPlay={() => m.playFrom(songs, i)}>
                            <SongMenuButton song={s} />
                            <ConfirmButton className="mx-icon-btn" onConfirm={() => removeFromPlaylist(s.videoId)} message="Remove from this playlist?" aria-label={`Remove ${s.title} from this playlist`} title="Remove from playlist">{Icon.close}</ConfirmButton>
                        </SongRow>
                    ))}
                </div>
            )}
        </Shell>
    );
}
