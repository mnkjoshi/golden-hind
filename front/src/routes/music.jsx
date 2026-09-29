import { useNavigate } from "react-router-dom";
import React, { useState, useRef } from 'react';
import axios from 'axios';
import Authenticate from "../components/authenticate.jsx";
import Topbar from "../components/topbar.jsx";
import '../stylesheets/music.css';

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

    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!user) { navigate('/auth'); return null; }
    Authenticate(user, token, navigate);

    const ytPattern = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/).+/;
    const inputIsUrl = ytPattern.test(url.trim());

    const runSearch = async () => {
        const q = url.trim();
        if (!q || searching) return;
        setSearching(true);
        setSearchError('');
        setSearchedFor(q);
        try {
            const res = await axios.post('https://ghb.mnkjoshi.ca/music/search', { user, token, query: q }, { timeout: 40000 });
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

    const downloadAll = async () => {
        if (queue.length === 0) return;
        setStatus('working');
        setError('');
        setLastTitle('');

        for (const item of queue) {
            try {
                setStatusLabel(`Downloading: ${item.url}`);

                const response = await axios.post(
                    'https://ghb.mnkjoshi.ca/music/download',
                    { user, token, url: item.url },
                    { responseType: 'blob', timeout: 180000 }
                );

                const titleHeader = response.headers['x-title'];
                const title = titleHeader ? decodeURIComponent(titleHeader) : 'download';

                setStatusLabel(`Saving: ${title}`);

                const blob = new Blob([response.data], { type: 'audio/mpeg' });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `${title}.mp3`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

                setLastTitle(title);
            } catch (e) {
                // Blob responses carry the server's JSON error as text.
                let msg = e.message || 'Download failed';
                if (e.response?.data) {
                    const raw = typeof e.response.data === 'string'
                        ? e.response.data
                        : (await e.response.data.text?.()) || '';
                    try { msg = JSON.parse(raw).error || msg; } catch { msg = raw || msg; }
                }
                setError(typeof msg === 'string' ? msg : 'Download failed');
                setStatus('error');
                return;
            }
        }

        setQueue([]);
        setStatus('done');
        setStatusLabel('');
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
            </div>
        </div>
    );
}
