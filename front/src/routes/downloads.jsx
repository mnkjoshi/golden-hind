// Everything saved on this device. With no connection the app routes here
// (see main.jsx), so it must work without any API call: songs come from
// IndexedDB + the last cached My Songs list, videos from Cache Storage +
// localStorage metadata, and art from the saved-art cache.
import { useNavigate, useParams } from 'react-router-dom';
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useRef, useState } from 'react';
import Topbar from '../components/topbar.jsx';
import CoverArt from '../components/coverArt.jsx';
import { playQueue, setShuffle, cachedLibrary, useMusicPlayer, currentSong } from '../player/musicPlayer.js';
import { listOffline, removeOffline } from '../player/offlineSongs.js';
import { listVideos, removeVideo, offlineVideoUrl } from '../player/offlineVideos.js';
import '../stylesheets/downloads.css';

const formatSize = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

function useOnline() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const up = () => setOnline(true), down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }, []);
    return online;
}

export default function Downloads() {
    const navigate = useNavigate();
    const online = useOnline();
    const player = useMusicPlayer();
    const playing = currentSong(player);
    const [songs, setSongs] = useState(null);
    const [videos, setVideos] = useState(() => listVideos());
    const [usage, setUsage] = useState(0);

    useEffect(() => {
        listOffline().then((ids) => {
            const known = new Map(cachedLibrary().map(s => [s.videoId, s]));
            setSongs([...ids].map(id => known.get(id) || { videoId: id, title: 'Unknown song', artist: '' }));
        });
        navigator.storage?.estimate?.().then(e => setUsage(e.usage || 0)).catch(() => {});
    }, []);

    const removeSong = async (s) => {
        await removeOffline(s.videoId);
        setSongs(prev => prev.filter(x => x.videoId !== s.videoId));
    };
    const deleteVideo = async (v) => {
        await removeVideo(v.key);
        setVideos(listVideos());
    };

    const nothing = songs !== null && songs.length === 0 && videos.length === 0;

    return (
        <div className="dl-page">
            <Topbar />
            <div className="dl-content">
                <h1 className="dl-title">Downloads</h1>
                {!online ? (
                    <div className="dl-banner offline">{"You're offline — showing what's saved on this device."}</div>
                ) : (
                    <div className="dl-banner">
                        Saved on this device{usage ? ` · ${formatSize(usage)} used` : ''}
                        <button onClick={() => navigate('/app')}>Back to Home</button>
                    </div>
                )}

                {nothing && (
                    <div className="dl-empty">
                        Nothing saved yet. Save songs from <strong>Music</strong> (“To phone”), and movies or
                        episodes from the player (“Save offline”).
                    </div>
                )}

                {videos.length > 0 && (
                    <section className="dl-section">
                        <h2>Movies &amp; shows</h2>
                        <div className="dl-videos">
                            {videos.map(v => (
                                <div key={v.key} className="dl-video">
                                    <button className="dl-video-open" onClick={() => navigate(`/downloads/play/${v.key}`)}>
                                        {v.poster ? <img src={v.poster} alt="" /> : <div className="dl-poster-empty" />}
                                        <span className="dl-video-title">{v.title}</span>
                                        <span className="dl-video-meta">
                                            {v.season ? `S${v.season} E${v.episode} · ` : ''}{formatSize(v.size || 0)}
                                        </span>
                                    </button>
                                    <button className="dl-remove" onClick={() => deleteVideo(v)} aria-label={`Delete ${v.title}`}>✕</button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {songs?.length > 0 && (
                    <section className="dl-section">
                        <div className="dl-section-head">
                            <h2>Songs ({songs.length})</h2>
                            <div className="dl-song-actions">
                                <button className="dl-play" onClick={() => { setShuffle(false); playQueue(songs, 0); }}>Play</button>
                                <button className="dl-shuffle" onClick={() => { setShuffle(true); playQueue(songs, Math.floor(Math.random() * songs.length)); }}>Shuffle</button>
                            </div>
                        </div>
                        <div className="dl-songs">
                            {songs.map((s, i) => (
                                <div key={s.videoId} className={`dl-song${playing?.videoId === s.videoId ? ' playing' : ''}`}>
                                    <button className="dl-song-open" onClick={() => playQueue(songs, i)}>
                                        <CoverArt className="dl-song-cover" videoId={s.videoId} />
                                        <span className="dl-song-text">
                                            <span className="dl-song-title">{s.title}</span>
                                            {s.artist && <span className="dl-song-artist">{s.artist}</span>}
                                        </span>
                                    </button>
                                    <button className="dl-remove" onClick={() => removeSong(s)} aria-label={`Remove ${s.title} from this device`}>✕</button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

// Full-screen viewer for a saved movie/episode, resuming where you left off.
export function DownloadPlayer() {
    const { key } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const meta = listVideos().find(v => v.key === key);
    const posKey = `offlinePos_${key}`;

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const resume = parseFloat(localStorage.getItem(posKey));
        const onMeta = () => { if (resume > 5 && resume < v.duration - 10) v.currentTime = resume; };
        let last = 0;
        const onTime = () => {
            if (Date.now() - last < 5000) return;
            last = Date.now();
            try { localStorage.setItem(posKey, String(v.currentTime)); } catch { /* noop */ }
        };
        const onEnd = () => { try { localStorage.removeItem(posKey); } catch { /* noop */ } };
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('ended', onEnd);
        return () => {
            v.removeEventListener('loadedmetadata', onMeta);
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('ended', onEnd);
        };
    }, [posKey]);

    return (
        <div className="dl-viewer">
            <div className="dl-viewer-bar">
                <button onClick={() => navigate('/downloads')}>← Downloads</button>
                <span>{meta ? `${meta.title}${meta.season ? ` · S${meta.season} E${meta.episode}` : ''}` : 'Saved video'}</span>
            </div>
            <video ref={videoRef} className="dl-video-el" src={offlineVideoUrl(key)} controls autoPlay playsInline />
        </div>
    );
}
