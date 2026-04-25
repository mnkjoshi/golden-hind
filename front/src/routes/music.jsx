import { useNavigate } from "react-router-dom";
import React, { useState, useRef } from 'react';
import axios from 'axios';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import Authenticate from "../components/authenticate.jsx";
import Topbar from "../components/topbar.jsx";
import '../stylesheets/music.css';

const FFMPEG_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

export default function Music() {
    const navigate = useNavigate();
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState('idle'); // idle | working | done | error
    const [statusLabel, setStatusLabel] = useState('');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [lastTitle, setLastTitle] = useState('');
    const [queue, setQueue] = useState([]);
    const inputRef = useRef(null);
    const ffmpegRef = useRef(null);

    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!user) { navigate('/auth'); return null; }
    Authenticate(user, token, navigate);

    const getFFmpeg = async () => {
        if (ffmpegRef.current) return ffmpegRef.current;
        setStatusLabel('Loading audio converter (~25MB, one-time)...');
        setProgress(0);
        const ffmpeg = new FFmpeg();
        ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.round(p * 100)));
        await ffmpeg.load({
            coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ffmpegRef.current = ffmpeg;
        return ffmpeg;
    };

    const addToQueue = () => {
        const trimmed = url.trim();
        if (!trimmed) return;
        const ytPattern = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/).+/;
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
                // Step 1: Server extracts signed CDN URL (no download, just metadata)
                setStatusLabel('Getting stream URL...');
                setProgress(0);
                const { data } = await axios.post('https://goldenhind.tech/music/url', { user, token, url: item.url }, { timeout: 30000 });
                const { streamUrl, title, ext } = data;

                // Step 2: Load ffmpeg.wasm (cached after first run)
                const ffmpeg = await getFFmpeg();

                // Step 3: Fetch audio stream directly from YouTube CDN (uses your residential IP)
                setStatusLabel(`Downloading: ${title}`);
                setProgress(0);
                const audioData = await fetchFile(streamUrl);

                // Step 4: Convert to MP3 in-browser
                setStatusLabel(`Converting: ${title}`);
                setProgress(0);
                const inputName = `input.${ext}`;
                await ffmpeg.writeFile(inputName, audioData);
                await ffmpeg.exec(['-i', inputName, '-codec:a', 'libmp3lame', '-q:a', '2', 'output.mp3']);

                // Step 5: Trigger browser save dialog
                const mp3Data = await ffmpeg.readFile('output.mp3');
                const blob = new Blob([mp3Data.buffer], { type: 'audio/mpeg' });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `${title}.mp3`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

                await ffmpeg.deleteFile(inputName).catch(() => {});
                await ffmpeg.deleteFile('output.mp3').catch(() => {});

                setLastTitle(title);
            } catch (e) {
                const msg = e.response?.data?.error || e.message || 'Download failed';
                setError(msg);
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
                        <p className="music-subtitle">Download YouTube videos as MP3</p>
                    </div>
                </div>

                <div className="music-input-card">
                    <div className="music-url-row">
                        <input
                            ref={inputRef}
                            type="text"
                            className="music-url-input"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={url}
                            onChange={e => { setUrl(e.target.value); if (status === 'error') setStatus('idle'); }}
                            onKeyDown={e => e.key === 'Enter' && addToQueue()}
                            disabled={isWorking}
                        />
                        <button
                            className="music-add-btn"
                            onClick={addToQueue}
                            disabled={isWorking || !url.trim()}
                        >
                            Add
                        </button>
                    </div>

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
                                    <svg viewBox="0 0 24 24" fill="none" className="music-queue-icon">
                                        <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                                        <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.75"/>
                                        <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.75"/>
                                    </svg>
                                    <span className="music-queue-url">{item.url}</span>
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
                                {progress > 0 && progress < 100 && (
                                    <div className="music-progress-bar">
                                        <div className="music-progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                )}
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
