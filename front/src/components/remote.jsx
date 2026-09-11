// Remote control: lets this device act as a "player" other devices on the
// same account can drive (a TV in player mode), or act as the controller
// driving another device. Commands travel through the backend's RTDB command
// queue and arrive over /remote/stream SSE — the same transport watch parties
// use, so it works through the existing reverse proxy with no websockets.
//
// Three pieces live here:
//   RemoteControl  — topbar button + modal (expose / control tabs) + the
//                    player-mode SSE engine. Mounted on every page via Topbar,
//                    so an exposed TV keeps listening wherever it navigates.
//   RemotePlayback — the controller UI that replaces the watch page while a
//                    remote target is selected: every existing Watch button in
//                    the app then plays on the target instead of locally.
//   Command hand-off: page-level playback commands (pause/seek/volume/...)
//                    are re-broadcast as `gh-remote` window events; watch.jsx
//                    applies them to its Plyr instance.
import { useNavigate, useLocation, useParams } from 'react-router-dom';
// eslint flags React as unused, but this project has no vite.config.js, so
// JSX compiles with the classic runtime and needs React in scope (like every
// other component file here).
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Topbar from './topbar';
import { defaultDeviceName, formatRemoteState, formatClock, estimatePosition } from '../utils/remote.js';

const BASE_URL = 'https://ghb.mnkjoshi.ca';

// Shared inline icon set — stroke-based like the topbar's icons, sized by CSS.
const Icons = {
    play: (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8.5 5.14a.7.7 0 0 1 1.06-.6l11 6.86a.7.7 0 0 1 0 1.2l-11 6.86a.7.7 0 0 1-1.06-.6V5.14z" />
        </svg>
    ),
    pause: (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" />
            <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" />
        </svg>
    ),
    stop: (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
        </svg>
    ),
    skipBack: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 6.5V3L7.5 7 12 11V7.5c3.04 0 5.5 2.46 5.5 5.5A5.5 5.5 0 1 1 6.5 13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    ),
    skipForward: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 6.5V3L16.5 7 12 11V7.5A5.5 5.5 0 1 0 17.5 13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    ),
    volume: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4.5 9.5v5H8l4.5 4v-13L8 9.5H4.5z" fill="currentColor" />
            <path d="M15.5 9.2a4.2 4.2 0 0 1 0 5.6M18 6.8a7.6 7.6 0 0 1 0 10.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    ),
    fullscreen: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
    ),
    close: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
};

// Stable per-browser device id, generated once. Path-safe (RTDB key).
export function getDeviceId() {
    let id = localStorage.getItem('remoteDeviceId');
    if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
        id = 'd' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
        localStorage.setItem('remoteDeviceId', id);
    }
    return id;
}

// The device this browser is currently controlling: { deviceId, name } | null.
export function getRemoteTarget() {
    try { return JSON.parse(localStorage.getItem('remoteTarget') || 'null'); } catch { return null; }
}

function setRemoteTargetStorage(target) {
    if (target) localStorage.setItem('remoteTarget', JSON.stringify(target));
    else localStorage.removeItem('remoteTarget');
}

function sendRemoteCommand(deviceId, command) {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!user || !token) return Promise.reject(new Error('no auth'));
    return axios.post(`${BASE_URL}/remote/command`, { user, token, deviceId, command });
}

// Tell the controlled device what title the controller is looking at, so its
// idle screen can mirror the detail view (null/undefined clears it). Used by
// the detail route; no-op when this browser isn't controlling anything.
export function sendRemotePreview(contentId) {
    const target = getRemoteTarget();
    if (!target) return;
    sendRemoteCommand(target.deviceId, contentId ? { type: 'preview', contentId } : { type: 'preview' })
        .catch(() => {});
}

export default function RemoteControl() {
    const navigate = useNavigate();
    const location = useLocation();
    const [modalOpen, setModalOpen] = useState(false);
    const [tab, setTab] = useState('control');
    const [exposeOn, setExposeOn] = useState(() => localStorage.getItem('remoteExpose') === 'on');
    const [exposeStatus, setExposeStatus] = useState('idle'); // idle | connecting | connected | error
    const [deviceName, setDeviceName] = useState(() =>
        localStorage.getItem('remoteDeviceName')
        || defaultDeviceName(navigator.userAgent, localStorage.getItem('tvMode') === 'on'));
    const [devices, setDevices] = useState(null);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [target, setTarget] = useState(getRemoteTarget);

    // ── Player-mode engine ───────────────────────────────────────────────────
    // Holds the SSE connection for as long as expose is on. Topbar remounts on
    // route changes, so this reconnects after each navigation — registration
    // lives on the connection server-side, and the brief gap is harmless.
    useEffect(() => {
        if (!exposeOn) { setExposeStatus('idle'); return; }
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!user || !token) return;
        let es = null;
        let reconnectTimer = null;
        let closed = false;

        const handleCommand = (cmd) => {
            if (!cmd || !cmd.type) return;
            switch (cmd.type) {
                case 'play': {
                    const cid = cmd.contentId;
                    if (!cid) return;
                    if (cmd.season) localStorage.setItem('season' + cid, cmd.season);
                    if (cmd.episode) localStorage.setItem('episode' + cid, cmd.episode);
                    // Force the native player (server 1) — it's the only provider
                    // whose playback the remote can drive; the iframe embeds (2/3)
                    // can't be scripted. The per-title key may hold a stale
                    // fallback from a previous local session.
                    localStorage.setItem('provider' + cid.slice(1), 1);
                    if (window.location.pathname === `/watch/${cid}`) {
                        // Already on the title — sync provider/episode + make sure
                        // it's playing.
                        window.dispatchEvent(new CustomEvent('gh-remote', { detail: { type: 'provider', provider: 1 } }));
                        if (cmd.season && cmd.episode) {
                            window.dispatchEvent(new CustomEvent('gh-remote', { detail: { type: 'episode', season: cmd.season, episode: cmd.episode } }));
                        }
                        window.dispatchEvent(new CustomEvent('gh-remote', { detail: { type: 'resume' } }));
                    } else {
                        navigate(`/watch/${cid}`);
                    }
                    break;
                }
                case 'stop':
                    navigate('/app');
                    break;
                case 'preview':
                    // Mirror the controller's detail view on the idle screen.
                    setPreviewId(cmd.contentId || null);
                    break;
                default:
                    // Playback-level commands are the watch page's business.
                    window.dispatchEvent(new CustomEvent('gh-remote', { detail: cmd }));
            }
        };

        const connect = () => {
            const url = `${BASE_URL}/remote/stream`
                + `?role=player`
                + `&deviceId=${encodeURIComponent(getDeviceId())}`
                + `&name=${encodeURIComponent(localStorage.getItem('remoteDeviceName') || deviceName)}`
                + `&user=${encodeURIComponent(user)}`
                + `&token=${encodeURIComponent(token)}`;
            es = new EventSource(url);
            setExposeStatus('connecting');
            es.onopen = () => setExposeStatus('connected');
            es.onerror = () => {
                setExposeStatus('error');
                if (es.readyState === EventSource.CLOSED && !closed) {
                    try { es.close(); } catch { /* noop */ }
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };
            es.addEventListener('command', (ev) => {
                try { handleCommand(JSON.parse(ev.data)); } catch { /* noop */ }
            });
        };

        connect();
        return () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            try { es?.close(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [exposeOn]);

    // ── TV idle screen ───────────────────────────────────────────────────────
    // Player mode IS appliance mode: while exposed and not on a watch page,
    // the screensaver stays up — no input dismisses it. The only way out is
    // the bottom-right exit button (which leaves player mode) or a play
    // command navigating to /watch. When the controller browses a title's
    // detail page, a `preview` command makes that title the face of the
    // screen; otherwise it cycles Continue Watching art.
    const [idleClock, setIdleClock] = useState(() => new Date());
    const [idleArt, setIdleArt] = useState(null); // null = not fetched yet
    const [idleArtIndex, setIdleArtIndex] = useState(0);
    const [previewId, setPreviewId] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const previewCacheRef = useRef(new Map());
    const idleActive = exposeOn && !location.pathname.startsWith('/watch/');

    // Resolve preview commands to full TMDB details (cached per title).
    useEffect(() => {
        if (!previewId) { setPreviewData(null); return; }
        const cached = previewCacheRef.current.get(previewId);
        if (cached) { setPreviewData(cached); return; }
        setPreviewData(null);
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!user || !token) return;
        let stale = false;
        axios.post(`${BASE_URL}/detail`, {
            user, token,
            tmdbId: previewId.slice(1),
            mediaType: previewId[0] === 't' ? 'tv' : 'movie',
        }).then(r => {
            if (!r.data || typeof r.data !== 'object') return;
            previewCacheRef.current.set(previewId, r.data);
            if (!stale) setPreviewData(r.data);
        }).catch(() => {});
        return () => { stale = true; };
    }, [previewId]);

    // Clock tick + art rotation + lazy art fetch, only while the screen shows.
    useEffect(() => {
        if (!idleActive) return;
        setIdleClock(new Date());
        const clock = setInterval(() => setIdleClock(new Date()), 15000);
        const rotate = setInterval(() => setIdleArtIndex(i => i + 1), 12000);
        if (idleArt === null) {
            const user = localStorage.getItem('user');
            const token = localStorage.getItem('token');
            if (user && token) {
                axios.post(`${BASE_URL}/home-continues`, { user, token })
                    .then(r => setIdleArt((r.data?.continuesData || [])
                        .filter(x => x && (x.backdrop_path || x.poster_path))
                        .slice(0, 8)))
                    .catch(() => setIdleArt([]));
            } else {
                setIdleArt([]);
            }
        }
        return () => { clearInterval(clock); clearInterval(rotate); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idleActive]);

    const idleItem = idleArt && idleArt.length > 0 ? idleArt[idleArtIndex % idleArt.length] : null;

    // ── Mini remote bar ──────────────────────────────────────────────────────
    // While controlling a device from any page EXCEPT the full remote (the
    // watch route), keep a live now-playing bar so navigating home never
    // strands the user without transport controls.
    const [targetDevice, setTargetDevice] = useState(null);
    const miniReceivedAtRef = useRef(0);
    const [, setMiniTick] = useState(0);
    const onWatchPage = location.pathname.startsWith('/watch/');

    useEffect(() => {
        if (!target || onWatchPage) { setTargetDevice(null); return; }
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!user || !token) return;
        let es = null;
        let reconnectTimer = null;
        let closed = false;
        // Slow re-render tick so freshness-based online state decays even
        // when no RTDB events arrive (a crashed player emits nothing).
        const tick = setInterval(() => setMiniTick(t => t + 1), 10000);
        const connect = () => {
            es = new EventSource(`${BASE_URL}/remote/stream?role=controller`
                + `&user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`);
            es.onmessage = (ev) => {
                try {
                    const list = JSON.parse(ev.data) || [];
                    const dev = list.find(d => d.deviceId === target.deviceId) || null;
                    if (dev) miniReceivedAtRef.current = Date.now();
                    setTargetDevice(dev);
                } catch { /* noop */ }
            };
            es.onerror = () => {
                if (es.readyState === EventSource.CLOSED && !closed) {
                    try { es.close(); } catch { /* noop */ }
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };
        };
        connect();
        return () => {
            closed = true;
            clearInterval(tick);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            try { es?.close(); } catch { /* noop */ }
        };
    }, [target, onWatchPage]);

    const miniState = targetDevice?.state;
    const miniOnline = !!targetDevice?.online && Date.now() - miniReceivedAtRef.current < 65000;
    const miniSend = (command) => {
        if (!target) return;
        sendRemoteCommand(target.deviceId, command).catch(() => {});
    };

    const toggleExpose = () => {
        setExposeOn(prev => {
            const next = !prev;
            localStorage.setItem('remoteExpose', next ? 'on' : 'off');
            return next;
        });
    };

    const saveDeviceName = (name) => {
        setDeviceName(name);
        localStorage.setItem('remoteDeviceName', name);
    };

    // ── Control tab ──────────────────────────────────────────────────────────
    const loadDevices = async () => {
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!user || !token) return;
        setDevicesLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/remote/devices`, { user, token });
            setDevices((res.data.devices || []).filter(d => d.deviceId !== getDeviceId()));
        } catch {
            setDevices([]);
        } finally {
            setDevicesLoading(false);
        }
    };

    const openModal = () => {
        setModalOpen(true);
        setTab(exposeOn ? 'expose' : 'control');
        loadDevices();
    };

    const startControlling = (device) => {
        const next = { deviceId: device.deviceId, name: device.name };
        setRemoteTargetStorage(next);
        setTarget(next);
        setModalOpen(false);
    };

    const stopControlling = () => {
        setRemoteTargetStorage(null);
        setTarget(null);
    };

    const active = exposeOn || !!target;

    return (
        <>
            <button
                className={`remote-toggle ${active ? 'active' : ''}`}
                type="button"
                onClick={openModal}
                title={target ? `Controlling ${target.name}` : exposeOn ? `Exposed as ${deviceName}` : 'Remote control'}
                aria-label="Remote control"
            >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="8" y="2.5" width="8" height="19" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="12" cy="7" r="1.7" fill="currentColor"/>
                    <path d="M10 12h4M10 15h4M10 18h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {target && <span className="remote-toggle-label">{target.name}</span>}
            </button>

            {target && !onWatchPage && miniState?.contentId && (
                <div className="remote-mini-bar">
                    <span className={`remote-dot ${miniOnline ? 'online' : ''}`} />
                    <button
                        className="remote-mini-info"
                        onClick={() => navigate(`/watch/${miniState.contentId}`)}
                        title="Open remote"
                    >
                        <span className="remote-mini-title">{miniState.title || 'Now playing'}</span>
                        <span className="remote-mini-sub">
                            on {target.name}
                            {miniState.contentId[0] === 't' && miniState.season ? ` · S${miniState.season} E${miniState.episode}` : ''}
                        </span>
                    </button>
                    <button
                        className="remote-mini-btn"
                        disabled={!miniOnline}
                        onClick={() => miniSend({ type: miniState.paused === false ? 'pause' : 'resume' })}
                        aria-label={miniState.paused === false ? 'Pause' : 'Play'}
                    >
                        {miniState.paused === false ? Icons.pause : Icons.play}
                    </button>
                    <button
                        className="remote-mini-btn"
                        disabled={!miniOnline}
                        onClick={() => miniSend({ type: 'stop' })}
                        aria-label="Stop"
                    >
                        {Icons.stop}
                    </button>
                    <button className="remote-mini-btn remote-mini-close" onClick={stopControlling} aria-label="Stop controlling" title="Stop controlling">
                        {Icons.close}
                    </button>
                </div>
            )}

            {idleActive && (() => {
                // One layout for both modes: unblurred wallpaper as the hero,
                // info top-left, clock bottom-left, exit bottom-right. Preview
                // (controller browsing a title) adds meta/genres/overview.
                const inPreview = !!(previewId && previewData);
                const wallpaper = inPreview
                    ? (previewData.backdrop_path || previewData.poster_path)
                    : idleItem ? (idleItem.backdrop_path || idleItem.poster_path) : null;
                const idleTitle = inPreview
                    ? (previewData.name || previewData.title)
                    : idleItem ? (idleItem.name || idleItem.title) : null;
                return (
                    <div className="remote-idle">
                        {wallpaper && (
                            <div
                                key={inPreview ? `preview-${previewId}` : `art-${idleItem.id}`}
                                className={`remote-idle-backdrop${inPreview ? ' preview' : ''}`}
                                style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${wallpaper})` }}
                            />
                        )}
                        <div className="remote-idle-scrim" />

                        {idleTitle && (
                            <div className="remote-idle-info">
                                <span className="remote-idle-label">{inPreview ? 'Now browsing' : 'Continue watching'}</span>
                                <h1 className="remote-idle-title">{idleTitle}</h1>
                                {inPreview && (
                                    <>
                                        <div className="remote-idle-meta">
                                            {(previewData.first_air_date || previewData.release_date || '').slice(0, 4)}
                                            {previewData.vote_average > 0 && <span> · ★ {previewData.vote_average.toFixed(1)}</span>}
                                            {previewId[0] === 't' && previewData.number_of_seasons
                                                ? <span> · {previewData.number_of_seasons} season{previewData.number_of_seasons === 1 ? '' : 's'}</span>
                                                : previewData.runtime ? <span> · {previewData.runtime} min</span> : null}
                                        </div>
                                        {previewData.genres?.length > 0 && (
                                            <div className="remote-idle-genres">
                                                {previewData.genres.slice(0, 4).map(g => (
                                                    <span key={g.id} className="remote-idle-genre-chip">{g.name}</span>
                                                ))}
                                            </div>
                                        )}
                                        {previewData.overview && (
                                            <p className="remote-idle-overview">{previewData.overview}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        <div className="remote-idle-ready">
                            <span className="remote-dot online" />
                            {deviceName}
                        </div>

                        <div className="remote-idle-clock-block">
                            <div className="remote-idle-clock">
                                {idleClock.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </div>
                            <div className="remote-idle-date">
                                {idleClock.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                            </div>
                        </div>

                        <button className="remote-idle-exit" onClick={toggleExpose}>
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 3v8M6.2 6.2a8 8 0 1 0 11.6 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            </svg>
                            Exit player mode
                        </button>
                    </div>
                );
            })()}

            {modalOpen && (
                <div className="remote-modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="remote-modal" onClick={e => e.stopPropagation()}>
                        <div className="remote-modal-header">
                            <h2>Remote Control</h2>
                            <button className="remote-modal-close" onClick={() => setModalOpen(false)}>✕</button>
                        </div>
                        <div className="remote-tabs">
                            <button className={tab === 'control' ? 'active' : ''} onClick={() => { setTab('control'); loadDevices(); }}>
                                Control a device
                            </button>
                            <button className={tab === 'expose' ? 'active' : ''} onClick={() => setTab('expose')}>
                                Use as player
                            </button>
                        </div>

                        {tab === 'expose' && (
                            <div className="remote-tab-body">
                                <p className="remote-hint">
                                    Expose this device so your other devices can control what it plays.
                                    Ideal for a TV: turn this on here, then pick titles from your phone.
                                </p>
                                <label className="remote-name-label">
                                    Device name
                                    <input
                                        className="remote-name-input"
                                        value={deviceName}
                                        maxLength={40}
                                        disabled={exposeOn}
                                        onChange={e => saveDeviceName(e.target.value)}
                                    />
                                </label>
                                <button className={`remote-expose-btn ${exposeOn ? 'on' : ''}`} onClick={toggleExpose}>
                                    {exposeOn ? 'Stop player mode' : 'Start player mode'}
                                </button>
                                {exposeOn && (
                                    <div className={`remote-status ${exposeStatus}`}>
                                        {exposeStatus === 'connected' ? `Ready — visible to your devices as “${deviceName}”`
                                            : exposeStatus === 'error' ? 'Connection lost — retrying…'
                                            : 'Connecting…'}
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'control' && (
                            <div className="remote-tab-body">
                                {target && (
                                    <div className="remote-controlling-banner">
                                        <span>Controlling <strong>{target.name}</strong> — anything you play opens there.</span>
                                        <button onClick={stopControlling}>Stop</button>
                                    </div>
                                )}
                                <div className="remote-devices-header">
                                    <p className="remote-hint">Devices in player mode on your account:</p>
                                    <button className="remote-refresh" onClick={loadDevices} disabled={devicesLoading}>↻</button>
                                </div>
                                {devicesLoading && !devices && <div className="remote-hint">Loading…</div>}
                                {devices && devices.length === 0 && (
                                    <div className="remote-empty">
                                        No players found. On the other device, open this menu and choose “Use as player”.
                                    </div>
                                )}
                                {devices && devices.map(d => (
                                    <div key={d.deviceId} className="remote-device-row">
                                        <span className={`remote-dot ${d.online ? 'online' : ''}`} />
                                        <div className="remote-device-info">
                                            <span className="remote-device-name">{d.name}</span>
                                            <span className="remote-device-state">{formatRemoteState(d.state)}</span>
                                        </div>
                                        <button
                                            className="remote-control-btn"
                                            disabled={!d.online || target?.deviceId === d.deviceId}
                                            onClick={() => startControlling(d)}
                                        >
                                            {target?.deviceId === d.deviceId ? 'Controlling' : 'Control'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

// ── Controller UI ────────────────────────────────────────────────────────────
// Rendered by the watch route instead of the local player while a remote
// target is selected. Sends the play command for the routed title, then shows
// live transport controls fed by the controller SSE stream. "Play here
// instead" clears the target and reloads so the route re-renders locally.
export function RemotePlayback() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [target] = useState(getRemoteTarget);
    const [device, setDevice] = useState(null);
    const [detail, setDetail] = useState(null);
    const [, setTick] = useState(0);
    const [dragSeek, setDragSeek] = useState(null);
    const [dragVolume, setDragVolume] = useState(null);
    const receivedAtRef = useRef(Date.now());
    const isTv = id.slice(0, 1) === 't';

    const send = (command) => {
        if (!target) return;
        sendRemoteCommand(target.deviceId, command).catch(() => {});
    };

    // Kick off playback on the target as soon as we land here.
    useEffect(() => {
        if (!target) return;
        const cmd = { type: 'play', contentId: id };
        if (isTv) {
            cmd.season = parseInt(localStorage.getItem('season' + id)) || 1;
            cmd.episode = parseInt(localStorage.getItem('episode' + id)) || 1;
        }
        send(cmd);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Title art + name for the backdrop (state reports carry only the title).
    useEffect(() => {
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!user || !token) return;
        axios.post(`${BASE_URL}/detail`, {
            user, token,
            tmdbId: id.slice(1),
            mediaType: isTv ? 'tv' : 'movie',
        }).then(res => setDetail(res.data)).catch(() => {});
    }, [id, isTv]);

    // Live device state over the controller stream.
    useEffect(() => {
        if (!target) return;
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!user || !token) return;
        let es = null;
        let reconnectTimer = null;
        let missingTimer = null;
        let closed = false;
        const connect = () => {
            es = new EventSource(`${BASE_URL}/remote/stream?role=controller`
                + `&user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`);
            es.onmessage = (ev) => {
                try {
                    const list = JSON.parse(ev.data) || [];
                    const dev = list.find(d => d.deviceId === target.deviceId) || null;
                    if (dev) {
                        if (missingTimer) { clearTimeout(missingTimer); missingTimer = null; }
                        setDevice(dev);
                        receivedAtRef.current = Date.now();
                    } else if (!missingTimer) {
                        // The player re-registers on every route change, so it can
                        // vanish from the list for a beat mid-navigation. Only mark
                        // it gone if it stays gone.
                        missingTimer = setTimeout(() => { missingTimer = null; setDevice(null); }, 4000);
                    }
                } catch { /* noop */ }
            };
            es.onerror = () => {
                if (es.readyState === EventSource.CLOSED && !closed) {
                    try { es.close(); } catch { /* noop */ }
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };
        };
        connect();
        return () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (missingTimer) clearTimeout(missingTimer);
            try { es?.close(); } catch { /* noop */ }
        };
    }, [target]);

    // 1s ticker so the position readout advances between 5s state reports.
    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, []);

    const playHere = () => {
        setRemoteTargetStorage(null);
        window.location.reload();
    };

    // Shouldn't happen (parent checks), but degrade gracefully.
    useEffect(() => { if (!target) window.location.reload(); }, [target]);
    if (!target) return null;

    const st = device?.state || null;
    // Liveness is freshness-based: a hard-crashed player stops producing RTDB
    // events entirely, so the last snapshot's `online` flag would otherwise
    // stick forever. A live player refreshes lastSeen at least every 25s, so
    // silence past ~65s means it's gone (the 1s ticker keeps this current).
    const online = !!device?.online && Date.now() - receivedAtRef.current < 65000;
    // Only trust the state once the player reports the title we asked for.
    const current = st && st.contentId === id ? st : null;
    const duration = current?.duration || 0;
    const position = dragSeek ?? (current ? estimatePosition(current, receivedAtRef.current, Date.now()) : 0);
    const paused = current ? current.paused !== false : true;
    const volume = dragVolume ?? current?.volume ?? 1;
    const season = current?.season || parseInt(localStorage.getItem('season' + id)) || 1;
    const episode = current?.episode || parseInt(localStorage.getItem('episode' + id)) || 1;
    const title = current?.title || detail?.name || detail?.title || '';
    const backdrop = detail?.backdrop_path ? `https://image.tmdb.org/t/p/original${detail.backdrop_path}` : null;

    const changeEpisode = (dir) => {
        const next = { season, episode: episode + dir };
        if (next.episode < 1) {
            if (season <= 1) return;
            next.season = season - 1;
            next.episode = 1; // episode counts per season aren't known here; player clamps
        }
        localStorage.setItem('season' + id, next.season);
        localStorage.setItem('episode' + id, next.episode);
        send({ type: 'episode', ...next });
    };

    return (
        <div className="remote-playback-page">
            <Topbar />
            {backdrop && <div className="remote-backdrop" style={{ backgroundImage: `url(${backdrop})` }} />}
            <div className="remote-playback-card">
                <div className="remote-playback-target">
                    <span className={`remote-dot ${online ? 'online' : ''}`} />
                    Playing on <strong>{target.name}</strong>
                    {!online && <span className="remote-offline-note"> — not connected</span>}
                </div>
                <h1 className="remote-playback-title">{title || '…'}</h1>
                {isTv && <div className="remote-playback-episode">Season {season} · Episode {episode}</div>}
                {current && current.provider > 1 && (
                    <div className="remote-provider-note">
                        {target.name} is on an embedded server (Server {current.provider}) — only play,
                        episode, and stop work there. Playback controls need Server 1.
                    </div>
                )}

                <div className="remote-seek-row">
                    <span className="remote-clock">{formatClock(position)}</span>
                    <input
                        type="range"
                        min={0}
                        max={duration || 1}
                        step={1}
                        value={Math.min(position, duration || 1)}
                        disabled={!duration}
                        onChange={e => setDragSeek(Number(e.target.value))}
                        onMouseUp={e => { send({ type: 'seek', position: Number(e.target.value) }); setTimeout(() => setDragSeek(null), 1500); }}
                        onTouchEnd={e => { send({ type: 'seek', position: Number(e.target.value) }); setTimeout(() => setDragSeek(null), 1500); }}
                    />
                    <span className="remote-clock">{formatClock(duration)}</span>
                </div>

                <div className="remote-transport">
                    <button className="remote-skip-btn" onClick={() => send({ type: 'seekBy', delta: -10 })} disabled={!online} aria-label="Back 10 seconds">
                        {Icons.skipBack}
                        <span className="remote-skip-num">10</span>
                    </button>
                    <button className="remote-play-btn" onClick={() => send({ type: paused ? 'resume' : 'pause' })} disabled={!online} aria-label={paused ? 'Play' : 'Pause'}>
                        {paused ? Icons.play : Icons.pause}
                    </button>
                    <button className="remote-skip-btn" onClick={() => send({ type: 'seekBy', delta: 10 })} disabled={!online} aria-label="Forward 10 seconds">
                        {Icons.skipForward}
                        <span className="remote-skip-num">10</span>
                    </button>
                </div>

                {isTv && (
                    <div className="remote-episode-row">
                        <button onClick={() => changeEpisode(-1)} disabled={!online || (season === 1 && episode === 1)}>‹ Prev</button>
                        <button onClick={() => changeEpisode(1)} disabled={!online}>Next ›</button>
                    </div>
                )}

                <div className="remote-volume-row">
                    <span className="remote-volume-icon" aria-hidden="true">{Icons.volume}</span>
                    <input
                        type="range" min={0} max={1} step={0.05} value={volume} disabled={!online}
                        onChange={e => setDragVolume(Number(e.target.value))}
                        onMouseUp={e => { send({ type: 'volume', level: Number(e.target.value) }); setTimeout(() => setDragVolume(null), 1500); }}
                        onTouchEnd={e => { send({ type: 'volume', level: Number(e.target.value) }); setTimeout(() => setDragVolume(null), 1500); }}
                    />
                </div>

                <div className="remote-playback-actions">
                    <button onClick={() => send({ type: 'fullscreen' })} disabled={!online}>{Icons.fullscreen}<span>Fullscreen</span></button>
                    <button onClick={() => send({ type: 'stop' })} disabled={!online}>{Icons.stop}<span>Stop on {target.name}</span></button>
                    <button onClick={playHere}><span>Play here instead</span></button>
                    <button onClick={() => navigate('/app')}><span>Back to home</span></button>
                </div>
            </div>
        </div>
    );
}
