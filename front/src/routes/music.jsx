import { useNavigate } from "react-router-dom";
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Authenticate from "../components/authenticate.jsx";
import Topbar from "../components/topbar.jsx";
import '../stylesheets/music.css';

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

export default function Music() {
    const navigate = useNavigate();
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState('idle'); // idle | working | done | error
    const [statusLabel, setStatusLabel] = useState('');
    const [error, setError] = useState('');
    const [lastTitle, setLastTitle] = useState('');
    const [queue, setQueue] = useState([]);
    // Song lookup: anything that isn't a YouTube link is treated as a search.
    const [searchResults, setSearchResults] = useState(null); // null = no search yet
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [searchedFor, setSearchedFor] = useState('');
    const inputRef = useRef(null);
    // My Songs: every downloaded song, re-downloadable in bulk as a ZIP.
    const [library, setLibrary] = useState(null); // null = loading
    const [libraryBusy, setLibraryBusy] = useState(false);
    const [libraryStatus, setLibraryStatus] = useState('');
    const [libraryRowBusy, setLibraryRowBusy] = useState(null); // videoId being re-downloaded

    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    const loadLibrary = () => axios.post(`${API}/music/library`, { user, token })
        .then(r => setLibrary(r.data?.songs || []))
        .catch(() => setLibrary(prev => prev || []));

    // Once per visit — in the render body it fired on every keystroke.
    useEffect(() => {
        if (!user) return;
        Authenticate(user, token, navigate);
        loadLibrary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!user) { navigate('/auth'); return null; }

    const ytPattern = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/).+/;
    const inputIsUrl = ytPattern.test(url.trim());

    const runSearch = async () => {
        const q = url.trim();
        if (!q || searching) return;
        setSearching(true);
        setSearchError('');
        setSearchedFor(q);
        try {
            const res = await axios.post(`${API}/music/search`, { user, token, query: q }, { timeout: 40000 });
            setSearchResults(res.data?.results || []);
        } catch (e) {
            setSearchResults([]);
            setSearchError(e.response?.data?.error || 'Search failed. Try again in a moment.');
        } finally {
            setSearching(false);
        }
    };

    const submitInput = () => (inputIsUrl ? addToQueue() : runSearch());

    const queueResult = (r) => {
        if (queue.some(q => q.url === r.url)) return;
        setQueue(prev => [...prev, {
            url: r.url, id: Date.now(),
            title: r.title, channel: r.channel, duration: r.duration, thumbnail: r.thumbnail,
        }]);
        if (status === 'done') setStatus('idle');
    };

    const addToQueue = () => {
        const trimmed = url.trim();
        if (!trimmed) return;
        if (!ytPattern.test(trimmed)) {
            setError('Please enter a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...)');
            setStatus('error');
            return;
        }
        if (queue.some(q => q.url === trimmed)) {
            setError('This URL is already in the queue.');
            setStatus('error');
            return;
        }
        setQueue(prev => [...prev, { url: trimmed, id: Date.now() }]);
        setUrl('');
        setError('');
        if (status === 'error') setStatus('idle');
        inputRef.current?.focus();
    };

    const removeFromQueue = (id) => setQueue(prev => prev.filter(q => q.id !== id));

    // Download one song and hand it to the browser as an MP3. Returns the
    // saved title; throws on failure.
    const saveSong = async (songUrl) => {
        const response = await axios.post(
            `${API}/music/download`,
            { user, token, url: songUrl },
            { responseType: 'blob', timeout: 180000 }
        );
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
    };

    const downloadAll = async () => {
        if (queue.length === 0) return;
        setStatus('working');
        setError('');
        setLastTitle('');

        for (const item of queue) {
            try {
                setStatusLabel(`Downloading: ${item.title || item.url}`);
                setLastTitle(await saveSong(item.url));
            } catch (e) {
                setError(await requestError(e, 'Download failed'));
                setStatus('error');
                loadLibrary();
                return;
            }
        }

        setQueue([]);
        setStatus('done');
        setStatusLabel('');
        loadLibrary(); // downloads are added to My Songs server-side
    };

    // "Download all": make sure every song is ready on the server (with
    // progress), then fetch them as one ZIP. Ready songs skip YouTube entirely.
    const downloadLibrary = async () => {
        if (!library?.length || libraryBusy) return;
        setLibraryBusy(true);
        const pending = library.filter(s => !s.cached);
        let failed = 0;
        for (let i = 0; i < pending.length; i++) {
            setLibraryStatus(`Preparing ${i + 1} of ${pending.length}: ${pending[i].title}`);
            try {
                await axios.post(`${API}/music/cache`, { user, token, videoId: pending[i].videoId }, { timeout: 180000 });
                setLibrary(prev => prev.map(s => (s.videoId === pending[i].videoId ? { ...s, cached: true } : s)));
            } catch {
                failed++;
            }
        }
        setLibraryStatus(failed
            ? `${failed} song${failed === 1 ? '' : 's'} couldn't be prepared and will be left out of the ZIP. Starting download…`
            : 'Starting download…');
        const a = document.createElement('a');
        a.href = `${API}/music/library/zip?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setLibraryBusy(false);
        setTimeout(() => setLibraryStatus(''), failed ? 12000 : 4000);
    };

    const downloadLibrarySong = async (song) => {
        if (libraryRowBusy) return;
        setLibraryRowBusy(song.videoId);
        try {
            await saveSong(`https://www.youtube.com/watch?v=${song.videoId}`);
            setLibrary(prev => prev.map(s => (s.videoId === song.videoId ? { ...s, cached: true } : s)));
        } catch (e) {
            setLibraryStatus(await requestError(e, 'Download failed'));
        } finally {
            setLibraryRowBusy(null);
        }
    };

    const removeLibrarySong = (song) => {
        setLibrary(prev => prev.filter(s => s.videoId !== song.videoId));
        axios.post(`${API}/music/library/remove`, { user, token, videoId: song.videoId }).catch(() => loadLibrary());
    };

    const saveResult = (r) => {
        if (library?.some(s => s.videoId === r.videoId)) return;
        setLibrary(prev => [{ videoId: r.videoId, title: r.title, artist: r.channel || '', thumbnail: r.thumbnail, cached: false, addedAt: Date.now() }, ...(prev || [])]);
        axios.post(`${API}/music/library/add`, { user, token, song: { videoId: r.videoId, title: r.title, artist: r.channel } })
            .catch(() => loadLibrary());
    };

    const isWorking = status === 'working';

    return (
        <div className="music-page">
            <Topbar />
            <div className="music-content">
                <div className="music-header">
                    <div className="music-header-icon">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.75"/>
                            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.75"/>
                        </svg>
                    </div>
                    <div>
                        <h1 className="music-title">Music Downloader</h1>
                        <p className="music-subtitle">Search for a song or paste a YouTube link, then download as MP3</p>
                    </div>
                </div>

                <div className="music-input-card">
                    <div className="music-url-row">
                        <input
                            ref={inputRef}
                            type="text"
                            className="music-url-input"
                            placeholder="Search for a song, or paste a YouTube link"
                            value={url}
                            onChange={e => { setUrl(e.target.value); if (status === 'error') setStatus('idle'); }}
                            onKeyDown={e => e.key === 'Enter' && submitInput()}
                            disabled={isWorking}
                        />
                        <button
                            className="music-add-btn"
                            onClick={submitInput}
                            disabled={isWorking || searching || !url.trim()}
                        >
                            {inputIsUrl ? 'Add' : searching ? 'Searching…' : 'Search'}
                        </button>
                    </div>

                    {(searching || searchResults !== null) && (
                        <div className="music-results">
                            {searching ? (
                                <div className="music-results-state">
                                    <div className="music-spinner" />
                                    <span>Searching YouTube for “{searchedFor}”…</span>
                                </div>
                            ) : searchError ? (
                                <div className="music-results-state error">{searchError}</div>
                            ) : searchResults.length === 0 ? (
                                <div className="music-results-state">No results for “{searchedFor}”.</div>
                            ) : (
                                <>
                                    <div className="music-results-header">
                                        <span>Results for “{searchedFor}”</span>
                                        <button className="music-clear-btn" onClick={() => setSearchResults(null)}>Close</button>
                                    </div>
                                    {searchResults.map(r => {
                                        const queued = queue.some(q => q.url === r.url);
                                        return (
                                            <div key={r.videoId} className="music-result">
                                                <img className="music-result-thumb" src={r.thumbnail} alt="" loading="lazy" />
                                                <div className="music-result-info">
                                                    <span className="music-result-title">{r.title}</span>
                                                    <span className="music-result-meta">
                                                        {r.official && (
                                                            <span className="music-result-official" title="The artist's official audio, from YouTube Music">
                                                                Official audio
                                                            </span>
                                                        )}
                                                        {[r.channel, r.duration].filter(Boolean).join(' · ')}
                                                    </span>
                                                </div>
                                                <button
                                                    className={`music-result-add music-result-save${library?.some(s => s.videoId === r.videoId) ? ' queued' : ''}`}
                                                    onClick={() => saveResult(r)}
                                                    disabled={!library || library.some(s => s.videoId === r.videoId)}
                                                    title="Save to My Songs without downloading"
                                                >
                                                    {library?.some(s => s.videoId === r.videoId) ? 'Saved' : 'Save'}
                                                </button>
                                                <button
                                                    className={`music-result-add${queued ? ' queued' : ''}`}
                                                    onClick={() => queueResult(r)}
                                                    disabled={queued || isWorking}
                                                >
                                                    {queued ? 'Queued' : '+ Queue'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="music-status error">
                            <svg viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                                <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {status === 'done' && lastTitle && (
                        <div className="music-status success">
                            <svg viewBox="0 0 24 24" fill="none">
                                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>Downloaded: <strong>{lastTitle}</strong></span>
                        </div>
                    )}
                </div>

                {queue.length > 0 && (
                    <div className="music-queue-card">
                        <div className="music-queue-header">
                            <span className="music-queue-title">Queue ({queue.length})</span>
                            {!isWorking && (
                                <button className="music-clear-btn" onClick={() => setQueue([])}>Clear all</button>
                            )}
                        </div>

                        <div className="music-queue-list">
                            {queue.map(item => (
                                <div key={item.id} className="music-queue-item">
                                    {item.thumbnail ? (
                                        <img className="music-queue-thumb" src={item.thumbnail} alt="" />
                                    ) : (
                                        <svg viewBox="0 0 24 24" fill="none" className="music-queue-icon">
                                            <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                                            <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.75"/>
                                            <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.75"/>
                                        </svg>
                                    )}
                                    {item.title ? (
                                        <span className="music-queue-url music-queue-named">
                                            <span className="music-queue-name">{item.title}</span>
                                            {item.channel && <span className="music-queue-channel">{item.channel}</span>}
                                        </span>
                                    ) : (
                                        <span className="music-queue-url">{item.url}</span>
                                    )}
                                    {!isWorking && (
                                        <button className="music-queue-remove" onClick={() => removeFromQueue(item.id)}>
                                            <svg viewBox="0 0 24 24" fill="none">
                                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {isWorking ? (
                            <div className="music-progress-section">
                                <div className="music-progress-label">
                                    <div className="music-spinner" />
                                    <span>{statusLabel}</span>
                                </div>
                            </div>
                        ) : (
                            <button className="music-download-btn" onClick={downloadAll}>
                                <svg viewBox="0 0 24 24" fill="none">
                                    <path d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Download {queue.length > 1 ? `${queue.length} MP3s` : 'MP3'}
                            </button>
                        )}
                    </div>
                )}

                <div className="music-library-card">
                    <div className="music-queue-header">
                        <span className="music-queue-title">
                            My Songs{library ? ` (${library.length})` : ''}
                            {library?.length > 0 && (
                                <span className="music-library-ready">
                                    {library.filter(s => s.cached).length} ready offline
                                </span>
                            )}
                        </span>
                        {library?.length > 0 && (
                            <button className="music-library-all" onClick={downloadLibrary} disabled={libraryBusy}>
                                {libraryBusy ? 'Preparing…' : 'Download all (.zip)'}
                            </button>
                        )}
                    </div>

                    {libraryStatus && <div className="music-library-status">{libraryBusy && <div className="music-spinner" />}<span>{libraryStatus}</span></div>}

                    {library === null ? (
                        <div className="music-results-state"><div className="music-spinner" /><span>Loading your songs…</span></div>
                    ) : library.length === 0 ? (
                        <div className="music-results-state">Songs you download (or save from search) show up here.</div>
                    ) : (
                        <div className="music-library-list">
                            {library.map(s => (
                                <div key={s.videoId} className="music-queue-item">
                                    <img className="music-queue-thumb" src={s.thumbnail} alt="" loading="lazy" />
                                    <span className="music-queue-url music-queue-named">
                                        <span className="music-queue-name">{s.title}</span>
                                        {s.artist && <span className="music-queue-channel">{s.artist}</span>}
                                    </span>
                                    <span className={`music-library-dot${s.cached ? ' ready' : ''}`} title={s.cached ? 'Ready — downloads instantly' : 'Will be fetched from YouTube first'} />
                                    <button
                                        className="music-queue-remove"
                                        onClick={() => downloadLibrarySong(s)}
                                        disabled={!!libraryRowBusy || libraryBusy}
                                        aria-label={`Download ${s.title}`}
                                        title="Download MP3"
                                    >
                                        {libraryRowBusy === s.videoId ? <div className="music-spinner" /> : (
                                            <svg viewBox="0 0 24 24" fill="none">
                                                <path d="M12 15V3m0 12-4-4m4 4 4-4M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        className="music-queue-remove"
                                        onClick={() => removeLibrarySong(s)}
                                        disabled={libraryBusy}
                                        aria-label={`Remove ${s.title}`}
                                        title="Remove from My Songs"
                                    >
                                        <svg viewBox="0 0 24 24" fill="none">
                                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
