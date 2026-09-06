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
import { useNavigate, useParams } from 'react-router-dom';
// eslint flags React as unused, but this project has no vite.config.js, so
// JSX compiles with the classic runtime and needs React in scope (like every
// other component file here).
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Topbar from './topbar';
import { defaultDeviceName, formatRemoteState, formatClock, estimatePosition } from '../utils/remote.js';

const BASE_URL = 'https://goldenhind.tech';

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

export default function RemoteControl() {
    const navigate = useNavigate();
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
    const online = !!device?.online;
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
                    <button onClick={() => send({ type: 'seekBy', delta: -10 })} disabled={!online} aria-label="Back 10 seconds">⟲ 10</button>
                    <button className="remote-play-btn" onClick={() => send({ type: paused ? 'resume' : 'pause' })} disabled={!online}>
                        {paused ? '▶' : '⏸'}
                    </button>
                    <button onClick={() => send({ type: 'seekBy', delta: 10 })} disabled={!online} aria-label="Forward 10 seconds">10 ⟳</button>
                </div>

                {isTv && (
                    <div className="remote-episode-row">
                        <button onClick={() => changeEpisode(-1)} disabled={!online || (season === 1 && episode === 1)}>‹ Prev</button>
                        <button onClick={() => changeEpisode(1)} disabled={!online}>Next ›</button>
                    </div>
                )}

                <div className="remote-volume-row">
                    <span aria-hidden="true">🔊</span>
                    <input
                        type="range" min={0} max={1} step={0.05} value={volume} disabled={!online}
                        onChange={e => setDragVolume(Number(e.target.value))}
                        onMouseUp={e => { send({ type: 'volume', level: Number(e.target.value) }); setTimeout(() => setDragVolume(null), 1500); }}
                        onTouchEnd={e => { send({ type: 'volume', level: Number(e.target.value) }); setTimeout(() => setDragVolume(null), 1500); }}
                    />
                </div>

                <div className="remote-playback-actions">
                    <button onClick={() => send({ type: 'stop' })} disabled={!online}>Stop on {target.name}</button>
                    <button onClick={playHere}>Play here instead</button>
                    <button onClick={() => navigate('/app')}>Back to home</button>
                </div>
            </div>
        </div>
    );
}
