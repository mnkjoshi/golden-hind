// Music section — Spotify-style: Home (/music), Search (/music/search) and
// Library (/music/library). On phones the bottom tab bar switches between
// them; on desktop a pill nav at the top does. All three share one hook for
// the song library, offline copies, and actions.
import { useNavigate, useLocation } from "react-router-dom";
// eslint flags React as unused, but this project compiles JSX with the classic runtime.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import Authenticate from "../components/authenticate.jsx";
import Topbar from "../components/topbar.jsx";
import CoverArt from "../components/coverArt.jsx";
import '../stylesheets/music.css';
import { useMusicPlayer, playQueue, currentSong, togglePlay, setShuffle, cachedLibrary, setExpanded } from '../player/musicPlayer.js';
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
        setShuffle(false);
        playQueue(list, index);
    };
    const shufflePlay = (list) => {
        if (!list?.length) return;
        setShuffle(true);
        playQueue(list, Math.floor(Math.random() * list.length));
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
        playFrom, shufflePlay, toggleOffline, saveAllOffline, downloadZip, downloadSong, removeSong, isSaved, toggleSaved,
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
    const tabs = [['/music', 'Home'], ['/music/search', 'Search'], ['/music/library', 'Library']];
    return (
        <div className="mx-nav">
            {tabs.map(([path, label]) => (
                <button key={path} className={pathname === path ? 'active' : ''} onClick={() => navigate(path)}>{label}</button>
            ))}
        </div>
    );
}

function Shell({ children }) {
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

// One row in a song list: cover, title/artist, now-playing indicator.
function SongRow({ song, isPlaying, playingNow, onPlay, children }) {
    return (
        <div className={`mx-row${isPlaying ? ' playing' : ''}`}>
            <button className="mx-row-main" onClick={onPlay} aria-label={`Play ${song.title}`}>
                <CoverArt className="mx-row-cover" videoId={song.videoId} />
                <span className="mx-row-text">
                    <span className="mx-row-title">
                        {isPlaying && playingNow && <span className="music-eq" aria-hidden="true"><i /><i /><i /></span>}
                        {song.title}
                    </span>
                    {(song.artist || song.channel) && <span className="mx-row-artist">{song.artist || song.channel}</span>}
                </span>
            </button>
            {children}
        </div>
    );
}

// ── Home ─────────────────────────────────────────────────────────────────────

export default function MusicHome() {
    const navigate = useNavigate();
    const m = useMusicLibrary();
    const library = m.library || [];
    const artists = useArtists(library);
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
                        <button className="mx-jump" onClick={() => setExpanded(true)}>
                            <CoverArt className="mx-jump-cover" videoId={now.videoId} />
                            <span className="mx-jump-text">
                                <span className="mx-jump-label">Jump back in</span>
                                <span className="mx-jump-title">{now.title}</span>
                                <span className="mx-jump-artist">{now.artist}</span>
                            </span>
                        </button>
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
                                            <button className={`mx-icon-btn${queued ? ' on' : ''}`} onClick={() => queueResult(r)} disabled={queued || qStatus === 'working'} aria-label="Add to download queue" title="Add to MP3 download queue">
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
    const list = useMemo(() => {
        const all = [...(m.library || [])].sort((SORTS[sort] || SORTS.recent).fn);
        return onlyDownloaded ? all.filter(s => m.offlineIds.has(s.videoId)) : all;
    }, [m.library, sort, onlyDownloaded, m.offlineIds]);
    if (!m.user) { navigate('/auth'); return null; }

    const changeSort = (v) => { setSort(v); try { localStorage.setItem('musicLibrarySort', v); } catch { /* noop */ } };
    const onDevice = (m.library || []).filter(s => m.offlineIds.has(s.videoId)).length;

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
                <div className="mx-list">
                    {list.map((s, i) => (
                        <SongRow
                            key={s.videoId}
                            song={s}
                            isPlaying={m.playing?.videoId === s.videoId}
                            playingNow={!m.player.paused}
                            onPlay={() => m.playFrom(list, i)}
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
                            <button className="mx-icon-btn mx-desktop" onClick={() => m.downloadSong(s)} disabled={!!m.rowBusy} aria-label={`Download ${s.title}`} title="Download MP3">
                                {m.rowBusy === s.videoId ? <div className="music-spinner" /> : Icon.download}
                            </button>
                            <button className="mx-icon-btn" onClick={() => m.removeSong(s)} aria-label={`Remove ${s.title}`} title="Remove from library">{Icon.close}</button>
                        </SongRow>
                    ))}
                </div>
            )}
        </Shell>
    );
}
