import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { track } from '../utils/analytics.js'
import Topbar from "../components/topbar"


export default function App() {
    // useParams must come first — id is needed to initialize progressReady
    const { id } = useParams();
    let type = id.slice(0, 1)
    let vidID = id.slice(1, 100000)

    const [season, setSeason] = useState(1);
    const [episode, setEpisode] = useState(1);

    const [first, setFirst] = useState(0);

    const [relData, reloadVideo] = useState(1);

    const [maxEp, setMaxEp] = useState(999);
    const [maxSe, setMaxSe] = useState(999);

    const [autoNext, setAutoNext] = useState(0);
    const [autoPlay, setAutoPlay] = useState(0);

    const [provider, setProvider] = useState(1);

    // For TV shows, block the LookMovie request until progress_retrieve has responded
    // so we don't fire with season=1/episode=1 before the saved position loads.
    // Movies have no saved progress so they're ready immediately.
    const [progressReady, setProgressReady] = useState(id.slice(0, 1) !== 't');

    const [lmUrl, setLmUrl] = useState(null);
    const [lmSubtitles, setLmSubtitles] = useState([]);
    const [lmLoading, setLmLoading] = useState(false);
    const [lmError, setLmError] = useState(null);
    const [skipFlash, setSkipFlash] = useState(null); // 'forward' | 'back' | null
    const [controlsVisible, setControlsVisible] = useState(true);
    // When Plyr enters desktop fullscreen it fullscreens its own .plyr element,
    // so sibling overlays (up-next, skip buttons) disappear. We portal those
    // overlays into the fullscreen element while it's active.
    const [fsHost, setFsHost] = useState(null);
    const lmContainerRef = useRef(null);
    const hlsRef = useRef(null);
    const plyrRef = useRef(null);
    const flashTimeoutRef = useRef(null);
    const inPlayerCastBtnRef = useRef(null);
    const skipIdleTimerRef = useRef(null);
    const skipIdleCleanupRef = useRef(null);
    const watchPlayerRef = useRef(null);
    const creditsIntervalRef = useRef(null);

    const [upNextInfo, setUpNextInfo] = useState(null); // { targetEpisode, targetSeason }
    const [upNextSeconds, setUpNextSeconds] = useState(5);
    const [upNextCounting, setUpNextCounting] = useState(false);
    const [nextEpData, setNextEpData] = useState(null); // { name, still_path }
    const upNextTimerRef = useRef(null);
    const upNextInfoRef = useRef(null);
    const executeUpNextRef = useRef(null);

    const [providerToast, setProviderToast] = useState(null);
    const providerToastTimerRef = useRef(null);
    const [subtitleDebugOverlay, setSubtitleDebugOverlay] = useState([]);

    // Cast / AirPlay state — only relevant for provider 1 (HTML5 <video> w/ HLS)
    const [castSupported, setCastSupported] = useState(false);
    const [castConnected, setCastConnected] = useState(false);
    // Cast SDK plumbing (Chromium browsers: Chrome/Brave/Edge). Safari uses
    // webkitShowPlaybackTargetPicker on the <video> element directly.
    const castContextRef = useRef(null);
    const castDeviceAvailableRef = useRef(false);
    const lmUrlRef = useRef(null);
    const lmSubtitlesRef = useRef([]);

    const[bookmarked, setBookmark] = useState(-1)
    const[myListed, setMyListed] = useState(-1);

    const [episodeID, setEpisodeID] = useState("")
    
    const [movID, setMovID] = useState("")
    const [data, setData] = useState({})
    const [voteAvg, setVotes] = useState(0.000);

    const[similarData, setSimilarData] = useState("")

    const [seriesData, setSeriesData] = useState("")
    const [seriesID, setSeriesID] = useState("")

    const [panelSeason, setPanelSeason] = useState(1);
    const [subOffset, setSubOffset] = useState(0);
    const subOffsetRef = useRef(0);
    const videoRef = useRef(null);

    const startTimeRef = useRef(Date.now());
    const contentNameRef = useRef('');
    const continueTrackedRef = useRef(false);
    const watchTrackedRef = useRef(false);
    const playbackStateRef = useRef({});
    const savePositionTimerRef = useRef(null);
    // Server-side resume position (seconds) for the current episode/movie,
    // fetched cross-device so resume works on any device, not just this one.
    const resumePosRef = useRef(0);
    // Warmed next-episode stream so advancing is near-instant.
    // Shape: { key: "season_episode", url, subtitles }.
    const prefetchRef = useRef({ key: null, url: null, subtitles: null });

    // Watch party state.
    // The room id lives in the URL (?party=ABC123) so links are shareable.
    // Refs mirror the state so closures inside Plyr listeners always read the latest.
    let location = useLocation();
    const initialPartyRoomId = new URLSearchParams(location.search).get('party') || null;
    const partyDebugEnabled = new URLSearchParams(location.search).has('partydebug');
    const [partyRoomId, setPartyRoomId] = useState(initialPartyRoomId);
    const [partyStatus, setPartyStatus] = useState(initialPartyRoomId ? 'connecting' : 'idle');
    const [partyModalOpen, setPartyModalOpen] = useState(false);
    const [partyJoinInput, setPartyJoinInput] = useState('');
    const [partyJoinError, setPartyJoinError] = useState('');
    const [partyLinkCopied, setPartyLinkCopied] = useState(false);
    const [partyDebugLog, setPartyDebugLog] = useState([]);
    // Chat + presence within a party.
    const [partyChat, setPartyChat] = useState([]); // [{ id, user, text, ts }]
    const [partyChatInput, setPartyChatInput] = useState('');
    const [partyParticipants, setPartyParticipants] = useState([]);
    const [partyChatOpen, setPartyChatOpen] = useState(false);
    const [partyUnread, setPartyUnread] = useState(0);
    const partyChatSeenRef = useRef(new Set());
    const partyChatOpenRef = useRef(false);
    const partyChatEndRef = useRef(null);
    // Floating emoji reactions: [{ id, emoji, left }]. Auto-removed after the
    // float animation. spawnReactionRef lets the SSE listener call the latest.
    const [partyReactions, setPartyReactions] = useState([]);
    const reactionIdRef = useRef(0);
    const spawnReactionRef = useRef(null);
    const PARTY_EMOJI = ['❤️', '😂', '😮', '😢', '🔥', '👏', '👍', '🎉'];
    const partyRoomIdRef = useRef(initialPartyRoomId);
    const applyingRemotePartyRef = useRef(false);
    const partySourceRef = useRef(null);
    const pendingPartyStateRef = useRef(null);
    const pushPartyUpdateRef = useRef(null);
    const applyPartyStateRef = useRef(null);
    const partyPushDebounceRef = useRef(null);
    const partyLastSentRef = useRef(null);
    const partySettleUntilRef = useRef(0);
    // A per-tab UUID — used as the `actor` on every push so server-side echo
    // filtering works even when both peers are signed in as the same user
    // (useful for testing in two tabs / two browsers on one account).
    const partyClientIdRef = useRef(
        (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now()
    );
    useEffect(() => { partyRoomIdRef.current = partyRoomId; }, [partyRoomId]);

    // Live readout for the credits/title-screen heuristic. Enabled with
    // ?creditsdebug — shows brightness, motion, score and taint status.
    const creditsDebugEnabled = new URLSearchParams(location.search).has('creditsdebug');
    const [creditsDebug, setCreditsDebug] = useState(null);

    const partyLog = (...args) => {
        const line = `${new Date().toLocaleTimeString()} ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
        if (partyDebugEnabled) {
            console.log('[party]', ...args);
            setPartyDebugLog(prev => [line, ...prev].slice(0, 30));
        }
    };

    const navigate = useNavigate();
    const subTraceEnabled = new URLSearchParams(location.search).has('subtrace');
    const addSubtitleDebugLine = (line) => {
        if (!subTraceEnabled) return;
        const stamp = new Date().toLocaleTimeString();
        setSubtitleDebugOverlay(prev => [`${stamp} ${line}`, ...prev].slice(0, 12));
    };

    const describeTextTracks = (video) => Array.from(video?.textTracks || []).map((track, index) => ({
        index,
        kind: track.kind,
        label: track.label,
        language: track.language,
        mode: track.mode,
        cues: track.cues?.length ?? null,
        activeCues: Array.from(track.activeCues || []).slice(0, 3).map(cue => ({
            startTime: cue.startTime,
            endTime: cue.endTime,
            text: cue.text,
        })),
    }));

    const sendSubtitleTrace = (event, detail = {}, video = videoRef.current) => {
        if (!subTraceEnabled) return;
        const payload = {
            event,
            id,
            user: localStorage.getItem('user') || null,
            currentTime: Number.isFinite(video?.currentTime) ? video.currentTime : null,
            duration: Number.isFinite(video?.duration) ? video.duration : null,
            presentationMode: video?.webkitPresentationMode || null,
            tracks: describeTextTracks(video),
            detail,
        };
        console.log('[subtitle-trace]', payload);
        addSubtitleDebugLine(`${event} t=${payload.currentTime ?? 'n/a'} mode=${payload.presentationMode || 'n/a'}`);
        try {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            if (navigator.sendBeacon && navigator.sendBeacon('https://goldenhind.tech/debug/subtitle-trace', blob)) return;
        } catch {}
        fetch('https://goldenhind.tech/debug/subtitle-trace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => {});
    };

    // ── Watch party logic ────────────────────────────────────────────────────
    // Refs let Plyr listeners (registered inside the lmUrl effect) always call
    // the latest version of these functions without re-registration.
    // Push our local state to the party. Debounced so transient play→pause
    // bounces during buffering (Safari especially) collapse to one send. We
    // intentionally don't trust an `extra` from the triggering event — by the
    // time the debounce fires the video has settled and `p.paused` reflects
    // the user's actual intent, so the LAST event in any spurious cycle
    // doesn't win. Identical-to-last-sent pushes are dropped to avoid echoes,
    // and pushes during the source-change settle window are ignored entirely.
    pushPartyUpdateRef.current = () => {
        const roomId = partyRoomIdRef.current;
        if (!roomId) return;
        if (applyingRemotePartyRef.current) { partyLog('push skipped: applyingRemote'); return; }
        if (Date.now() < partySettleUntilRef.current) { partyLog('push skipped: settle window'); return; }
        if (partyPushDebounceRef.current) clearTimeout(partyPushDebounceRef.current);
        partyPushDebounceRef.current = setTimeout(() => {
            const p = plyrRef.current;
            const u = localStorage.getItem('user');
            const t = localStorage.getItem('token');
            if (!u || !t || !p) return;
            if (applyingRemotePartyRef.current) return;
            if (Date.now() < partySettleUntilRef.current) return;
            if (!isFinite(p.duration) || p.duration === 0) return;

            const state = {
                position: p.currentTime ?? 0,
                paused: !!p.paused,
                season: parseInt(season) || 1,
                episode: parseInt(episode) || 1,
            };

            const prev = partyLastSentRef.current;
            if (prev
                && prev.paused === state.paused
                && prev.season === state.season
                && prev.episode === state.episode
                && Math.abs(prev.position - state.position) < 0.8) {
                partyLog('push deduped', state);
                return;
            }
            partyLastSentRef.current = state;
            partyLog('push', state);
            axios.post('https://goldenhind.tech/party/update', {
                user: u, token: t, roomId, state,
                clientId: partyClientIdRef.current,
            }).then(() => partyLog('push ok'))
              .catch(e => partyLog('push fail', e.message || 'err'));
        }, 180);
    };

    applyPartyStateRef.current = (state) => {
        if (!state || typeof state !== 'object') return;
        // Stash for later — Plyr may not exist yet when the SSE fires (e.g.
        // first message right after joining, before the HLS source has loaded).
        pendingPartyStateRef.current = state;

        // Lock out pushes while we mutate the player so the resulting
        // play/pause/seeked events don't bounce back to peers. We also extend
        // the lock past the actual mutation since Safari can buffer for >500ms
        // before firing the canonical events.
        applyingRemotePartyRef.current = true;

        // Episode/season sync runs immediately; it drives lmUrl re-fetch which
        // sets up a new Plyr instance, and Plyr's loadedmetadata callback
        // re-runs this function with the stashed state to do the seek/play.
        if (id.slice(0, 1) === 't' && state.season != null && state.episode != null) {
            const s = parseInt(state.season);
            const e = parseInt(state.episode);
            if (s && e && (s !== parseInt(season) || e !== parseInt(episode))) {
                setSeason(s);
                setEpisode(e);
                localStorage.setItem('season' + id, s);
                localStorage.setItem('episode' + id, e);
                // Suppress pushes longer — source-change reinit takes a while
                partySettleUntilRef.current = Date.now() + 4000;
                setTimeout(() => { applyingRemotePartyRef.current = false; }, 4000);
                return;
            }
        }

        const p = plyrRef.current;
        if (!p || !isFinite(p.duration) || p.duration === 0) {
            // Player not ready — leave pendingPartyStateRef set; canplay/loadedmetadata will retry.
            setTimeout(() => { applyingRemotePartyRef.current = false; }, 1200);
            return;
        }

        if (typeof state.position === 'number' && Math.abs(p.currentTime - state.position) > 1.5) {
            p.currentTime = state.position;
        }
        if (state.paused === true && !p.paused) {
            p.pause();
        } else if (state.paused === false && p.paused) {
            p.play().catch(() => {});
        }

        // Seed lastSent so the upcoming play/pause/seeked events we just
        // synthesised compare equal and the debounce drops them.
        partyLastSentRef.current = {
            position: p.currentTime,
            paused: !!p.paused,
            season: parseInt(season) || 1,
            episode: parseInt(episode) || 1,
        };

        pendingPartyStateRef.current = null;
        // Hold the lock long enough to absorb buffering-induced pause/play
        // bounces on the receiving side.
        partySettleUntilRef.current = Date.now() + 1500;
        setTimeout(() => { applyingRemotePartyRef.current = false; }, 1500);
    };

    // SSE subscription — re-opened whenever the room id changes. Includes the
    // per-tab clientId so the server can filter out the originator's own
    // updates (works even with two tabs under one username).
    useEffect(() => {
        if (!partyRoomId) {
            setPartyStatus('idle');
            return;
        }
        const u = localStorage.getItem('user');
        const t = localStorage.getItem('token');
        if (!u || !t) return;
        // Fresh chat/presence state for this room.
        setPartyChat([]);
        setPartyParticipants([]);
        setPartyUnread(0);
        partyChatSeenRef.current = new Set();
        let es = null;
        let reconnectTimer = null;
        let closed = false;

        const connect = () => {
            const url = `https://goldenhind.tech/party/stream`
                + `?roomId=${encodeURIComponent(partyRoomId)}`
                + `&user=${encodeURIComponent(u)}`
                + `&token=${encodeURIComponent(t)}`
                + `&clientId=${encodeURIComponent(partyClientIdRef.current)}`;
            partyLog('SSE connect', url);
            es = new EventSource(url);
            partySourceRef.current = es;
            setPartyStatus('connecting');
            es.onopen = () => { partyLog('SSE open'); setPartyStatus('connected'); };
            es.onerror = (e) => {
                partyLog('SSE error', es.readyState);
                setPartyStatus('error');
                // Browsers will auto-reconnect EventSource on transient errors,
                // but if the server returned 4xx, readyState=CLOSED and we have
                // to recreate. Retry every 3s.
                if (es.readyState === EventSource.CLOSED && !closed) {
                    try { es.close(); } catch {}
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(connect, 3000);
                }
            };
            es.onmessage = (ev) => {
                try {
                    const state = JSON.parse(ev.data);
                    partyLog('recv', { actor: state.actor, paused: state.paused, position: state.position, s: state.season, e: state.episode });
                    applyPartyStateRef.current?.(state);
                } catch (err) {
                    partyLog('parse fail', err.message);
                }
            };
            es.addEventListener('end', () => {
                partyLog('SSE end (room deleted)');
                closed = true;
                setPartyStatus('idle');
                setPartyRoomId(null);
                const params = new URLSearchParams(window.location.search);
                params.delete('party');
                const next = window.location.pathname + (params.toString() ? `?${params}` : '');
                window.history.replaceState(null, '', next);
            });
            // Chat — server replays the last 50 then streams new messages.
            // Dedupe by id since replays repeat on reconnect.
            es.addEventListener('chat', (ev) => {
                try {
                    const m = JSON.parse(ev.data);
                    if (!m || !m.id || partyChatSeenRef.current.has(m.id)) return;
                    partyChatSeenRef.current.add(m.id);
                    setPartyChat(prev => [...prev, m].slice(-200));
                    if (!partyChatOpenRef.current && m.user !== u) {
                        setPartyUnread(n => n + 1);
                    }
                } catch {}
            });
            // Presence — array of participant usernames.
            es.addEventListener('presence', (ev) => {
                try { setPartyParticipants(JSON.parse(ev.data) || []); } catch {}
            });
            // Reactions — float the emoji over the player.
            es.addEventListener('reaction', (ev) => {
                try {
                    const r = JSON.parse(ev.data);
                    if (r?.emoji) spawnReactionRef.current?.(r.emoji);
                } catch {}
            });
        };

        connect();
        return () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            try { es?.close(); } catch {}
            partySourceRef.current = null;
        };
    }, [partyRoomId]);

    // Direct push for season/episode changes the local user made. Bypasses
    // the debounce + settle window because: (a) episode change is an explicit
    // user action, not a Plyr event cycle, so debouncing isn't needed; and
    // (b) the lmUrl effect opens a 2.5s settle window on every source change,
    // which would otherwise swallow the very push we need to send.
    const pushPartyEpisodeNow = (newSeason, newEpisode) => {
        const roomId = partyRoomIdRef.current;
        if (!roomId) return;
        const u = localStorage.getItem('user');
        const t = localStorage.getItem('token');
        if (!u || !t) return;
        const state = {
            position: 0,
            paused: false,
            season: parseInt(newSeason) || 1,
            episode: parseInt(newEpisode) || 1,
        };
        partyLastSentRef.current = state;
        partyLog('push EPISODE', state);
        axios.post('https://goldenhind.tech/party/update', {
            user: u, token: t, roomId, state,
            clientId: partyClientIdRef.current,
        }).then(() => partyLog('episode push ok'))
          .catch(e => partyLog('episode push fail', e.message || 'err'));
    };

    const startWatchParty = async () => {
        const u = localStorage.getItem('user');
        const t = localStorage.getItem('token');
        if (!u || !t) return;
        try {
            const r = await axios.post('https://goldenhind.tech/party/create', {
                user: u, token: t,
                contentId: id,
                season: parseInt(season) || 1,
                episode: parseInt(episode) || 1,
            });
            if (r.data?.roomId) {
                setPartyRoomId(r.data.roomId);
                const params = new URLSearchParams(window.location.search);
                params.set('party', r.data.roomId);
                window.history.replaceState(null, '', window.location.pathname + '?' + params);
                setPartyModalOpen(true);
            }
        } catch {}
    };

    const joinWatchParty = async () => {
        const code = (partyJoinInput || '').trim().toUpperCase();
        if (!/^[A-Z2-9]{6}$/.test(code)) {
            setPartyJoinError('Codes are 6 letters/digits.');
            return;
        }
        setPartyJoinError('');
        const u = localStorage.getItem('user');
        const t = localStorage.getItem('token');
        try {
            const r = await axios.post('https://goldenhind.tech/party/info', { user: u, token: t, roomId: code });
            const info = r.data;
            if (!info?.contentId) {
                setPartyJoinError('Room not found.');
                return;
            }
            // If the host is watching a different title, redirect to the right URL
            if (info.contentId !== id) {
                navigate(`/watch/${info.contentId}?party=${code}`);
                return;
            }
            setPartyRoomId(code);
            const params = new URLSearchParams(window.location.search);
            params.set('party', code);
            window.history.replaceState(null, '', window.location.pathname + '?' + params);
            setPartyModalOpen(false);
        } catch {
            setPartyJoinError('Could not join — bad code or network issue.');
        }
    };

    const leaveWatchParty = () => {
        setPartyRoomId(null);
        setPartyModalOpen(false);
        const params = new URLSearchParams(window.location.search);
        params.delete('party');
        const next = window.location.pathname + (params.toString() ? `?${params}` : '');
        window.history.replaceState(null, '', next);
    };

    const sendPartyChat = () => {
        const text = partyChatInput.trim();
        if (!text || !partyRoomId) return;
        const u = localStorage.getItem('user'), t = localStorage.getItem('token');
        if (!u || !t) return;
        setPartyChatInput('');
        // Message echoes back to us over the chat SSE channel, so no optimistic add.
        axios.post('https://goldenhind.tech/party/chat', { user: u, token: t, roomId: partyRoomId, text })
            .catch(() => {});
    };

    // Spawn a floating emoji over the player; auto-clears after the animation.
    const spawnReaction = (emoji) => {
        const rid = ++reactionIdRef.current;
        const left = 8 + Math.random() * 84; // % across the player width
        setPartyReactions(prev => [...prev, { id: rid, emoji, left }]);
        setTimeout(() => setPartyReactions(prev => prev.filter(r => r.id !== rid)), 2600);
    };
    spawnReactionRef.current = spawnReaction;

    // Reactions echo back to the sender over SSE too, so we don't add locally —
    // the round-trip keeps every viewer's display consistent.
    const sendReaction = (emoji) => {
        if (!partyRoomId) return;
        const u = localStorage.getItem('user'), t = localStorage.getItem('token');
        if (!u || !t) return;
        axios.post('https://goldenhind.tech/party/react', { user: u, token: t, roomId: partyRoomId, emoji })
            .catch(() => {});
    };

    // Keep the open-state ref in sync (SSE closures read it) and clear unread
    // whenever the chat panel is open.
    useEffect(() => {
        partyChatOpenRef.current = partyChatOpen;
        if (partyChatOpen) setPartyUnread(0);
    }, [partyChatOpen]);

    // Auto-scroll the chat to the newest message.
    useEffect(() => {
        if (partyChatOpen) partyChatEndRef.current?.scrollIntoView({ block: 'nearest' });
    }, [partyChat, partyChatOpen]);

    const copyPartyLink = () => {
        if (!partyRoomId) return;
        const url = `${window.location.origin}/watch/${id}?party=${partyRoomId}`;
        navigator.clipboard?.writeText(url).then(() => {
            setPartyLinkCopied(true);
            setTimeout(() => setPartyLinkCopied(false), 1800);
        }).catch(() => {});
    };

    // Disable body overflow when watch page is active + log watch time reliably.
    // Watch time is flushed as a delta on every "page might be going away" signal
    // — visibilitychange→hidden (covers tab switch / backgrounding, the common
    // case on mobile), pagehide, and unmount — using sendBeacon so it survives a
    // tab close. The previous version only fired on SPA unmount, so closing the
    // tab lost the session entirely (why the user-side total looked broken).
    useEffect(() => {
        document.body.classList.add('watch-page');
        document.documentElement.classList.add('watch-page');

        let lastFlush = Date.now();
        const flushWatchTime = () => {
            const now = Date.now();
            const duration = Math.round((now - lastFlush) / 1000);
            lastFlush = now; // reset so re-entry only counts new time (no double-count)
            const watchUser = localStorage.getItem('user');
            const watchToken = localStorage.getItem('token');
            if (!watchUser || !watchToken || duration < 10) return;
            const payload = JSON.stringify({
                user: watchUser,
                token: watchToken,
                contentId: id,
                contentName: contentNameRef.current || 'Unknown',
                duration,
            });
            let beaconed = false;
            try {
                beaconed = navigator.sendBeacon
                    && navigator.sendBeacon('https://goldenhind.tech/watch-time', new Blob([payload], { type: 'application/json' }));
            } catch { /* fall through to fetch */ }
            if (!beaconed) {
                fetch('https://goldenhind.tech/watch-time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                    body: payload,
                }).catch(() => {});
            }
        };
        const onVisibility = () => { if (document.visibilityState === 'hidden') flushWatchTime(); };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flushWatchTime);

        return () => {
            document.body.classList.remove('watch-page');
            document.documentElement.classList.remove('watch-page');
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', flushWatchTime);
            flushWatchTime();
        };
    }, []);

    // Log to continue watching only after 30 seconds to avoid accidental entries
    useEffect(() => {
        const timer = setTimeout(() => {
            if (continueTrackedRef.current) return;
            continueTrackedRef.current = true;
            const trackUser = localStorage.getItem('user');
            const trackToken = localStorage.getItem('token');
            if (!trackUser || !trackToken) return;
            let continues;
            try { continues = JSON.parse(localStorage.getItem('continues')); } catch { continues = []; }
            if (!Array.isArray(continues)) continues = [];
            if (!continues.includes(id)) {
                continues.push(id);
                localStorage.setItem('continues', JSON.stringify(continues));
            }
            localStorage.setItem('lastWatched_' + id, Date.now());
            axios({ method: 'post', url: 'https://goldenhind.tech/continue', data: { user: trackUser, token: trackToken, favId: id } });
        }, 30000);
        return () => clearTimeout(timer);
    }, []);

    // Keep contentNameRef in sync so the watch-time beacon always has a title.
    // For TV use the series name (data holds the *episode* for shows), and fire
    // a single, name-bearing `watch` analytics event once the title is known so
    // the admin feed shows what was watched instead of a bare content id.
    useEffect(() => {
        const isTv = id.slice(0, 1) === 't';
        const name = isTv ? (seriesData?.name || seriesData?.title) : (data?.name || data?.title);
        if (name) contentNameRef.current = name;
        if (name && !watchTrackedRef.current) {
            watchTrackedRef.current = true;
            track('watch', isTv
                ? { id, name, type: 'tv', season: parseInt(season) || 1, episode: parseInt(episode) || 1 }
                : { id, name, type: 'movie' });
        }
    }, [data, seriesData]);

    useEffect(() => { lmUrlRef.current = lmUrl; }, [lmUrl]);
    useEffect(() => { lmSubtitlesRef.current = lmSubtitles; }, [lmSubtitles]);

    // Load Google Cast SDK once. Enables Chromecast on Chromium browsers
    // (Brave/Chrome/Edge); Safari uses webkitShowPlaybackTargetPicker instead.
    useEffect(() => {
        const SCRIPT_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
        if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
            // Script already present from a prior mount — try to attach to the existing context.
            if (window.cast?.framework && !castContextRef.current) initCastContext();
            return;
        }

        function initCastContext() {
            if (!window.cast?.framework || !window.chrome?.cast) return;
            const ctx = window.cast.framework.CastContext.getInstance();
            ctx.setOptions({
                receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
            });
            castContextRef.current = ctx;

            const CastState = window.cast.framework.CastState;
            const applyState = (state) => {
                const available = state !== CastState.NO_DEVICES_AVAILABLE;
                castDeviceAvailableRef.current = available;
                if (available) setCastSupported(true);
                setCastConnected(state === CastState.CONNECTED);
            };
            applyState(ctx.getCastState());
            ctx.addEventListener(
                window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                (e) => applyState(e.castState),
            );
        }

        window.__onGCastApiAvailable = (isAvailable) => {
            if (isAvailable) initCastContext();
        };

        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
    }, []);

    // Fetch LookMovie stream when provider 4 is selected or episode changes.
    // progressReady is false for TV shows until progress_retrieve returns so we
    // don't fire with the default season=1/episode=1 before saved progress loads.
    useEffect(() => {
        if (parseInt(provider) !== 1) return;
        if (!progressReady) return;
        // If we warmed this exact episode's stream while the previous one
        // played, use it directly and skip the network round-trip.
        const epKey = `${parseInt(season)}_${parseInt(episode)}`;
        if (type === 'tv' && prefetchRef.current.key === epKey && prefetchRef.current.url) {
            setLmSubtitles(prefetchRef.current.subtitles || []);
            setLmError(null);
            setLmLoading(false);
            setLmUrl(prefetchRef.current.url);
            prefetchRef.current = { key: null, url: null, subtitles: null };
            return;
        }
        setLmUrl(null);
        setLmError(null);
        setLmLoading(true);
        axios({
            method: 'post',
            url: 'https://goldenhind.tech/server/lookmovie',
            data: { user, token, id, season, episode }
        }).then(r => {
            // if (r.data.dbg) console.group('[LookMovie Debug]'), r.data.dbg.forEach(l => console.log(l)), console.groupEnd();
            if (r.data.success) {
                const subs = r.data.subtitles || [];
                setLmSubtitles(subs);
                if (!Hls.isSupported() && subs.length > 0) {
                    setLmUrl(`https://goldenhind.tech/proxy/hls-with-subs?url=${encodeURIComponent(r.data.url)}&subs=${encodeURIComponent(JSON.stringify(subs))}`);
                } else {
                    setLmUrl(`https://goldenhind.tech/proxy/hls?url=${encodeURIComponent(r.data.url)}`);
                }
            } else {
                setProvider(3);
                localStorage.setItem("provider" + vidID, 3);
                showProviderToast('LookMovie unavailable - switched to Server 3');
            }
        }).catch(() => {
            setProvider(3);
            localStorage.setItem("provider" + vidID, 3);
            showProviderToast('LookMovie unavailable - switched to Server 3');
        }).finally(() => setLmLoading(false));
    }, [provider, season, episode, progressReady]);

    // Fetch the cross-device resume position for the current episode/movie.
    // Runs alongside the stream fetch; the quick POST almost always resolves
    // before the HLS manifest is parsed, so initPlyr's canplay restore can use
    // it. As a safety net we also seek here if the player is already up and
    // still near the start. Skipped in a watch party (party state is authority).
    useEffect(() => {
        if (parseInt(provider) !== 1 || !progressReady) return;
        resumePosRef.current = 0;
        if (partyRoomIdRef.current) return;
        const posKey = type === 'tv'
            ? `playbackPos_${id}_s${season}_e${episode}`
            : `playbackPos_${id}`;
        const u = localStorage.getItem('user'), t = localStorage.getItem('token');
        if (!u || !t) return;
        axios.post('https://goldenhind.tech/position/retrieve', { user: u, token: t, posKey })
            .then(r => {
                const serverPos = Number(r.data?.position) || 0;
                resumePosRef.current = serverPos;
                const p = plyrRef.current;
                if (p && serverPos > 5 && isFinite(p.duration) && p.duration > 0
                    && p.currentTime < serverPos - 2 && p.currentTime < 10 && !partyRoomIdRef.current) {
                    p.currentTime = serverPos;
                }
            })
            .catch(() => {});
    }, [provider, season, episode, progressReady, lmUrl]);

    // Warm the next episode's stream ~25s into the current one so advancing
    // (auto-next, up-next, or the next button) is near-instant. Only for the
    // HLS provider and only when a next episode exists.
    useEffect(() => {
        if (parseInt(provider) !== 1 || !progressReady || type !== 'tv') return;
        if (!maxEp || !maxSe) return;
        const ep = parseInt(episode), se = parseInt(season);
        const hasNext = ep < parseInt(maxEp) || se < parseInt(maxSe);
        if (!hasNext) return;
        const nextEp = ep < parseInt(maxEp) ? ep + 1 : 1;
        const nextSe = ep < parseInt(maxEp) ? se : se + 1;
        const key = `${nextSe}_${nextEp}`;
        if (prefetchRef.current.key === key && prefetchRef.current.url) return;
        const u = localStorage.getItem('user'), t = localStorage.getItem('token');
        if (!u || !t) return;
        const timer = setTimeout(() => {
            axios.post('https://goldenhind.tech/server/lookmovie', { user: u, token: t, id, season: nextSe, episode: nextEp })
                .then(r => {
                    if (r.data?.success && r.data.url) {
                        const subs = r.data.subtitles || [];
                        const url = (!Hls.isSupported() && subs.length > 0)
                            ? `https://goldenhind.tech/proxy/hls-with-subs?url=${encodeURIComponent(r.data.url)}&subs=${encodeURIComponent(JSON.stringify(subs))}`
                            : `https://goldenhind.tech/proxy/hls?url=${encodeURIComponent(r.data.url)}`;
                        prefetchRef.current = { key, url, subtitles: subs };
                    }
                })
                .catch(() => {});
        }, 25000);
        return () => clearTimeout(timer);
    }, [provider, season, episode, maxEp, maxSe, progressReady]);

    // Attach HLS.js + Plyr when a stream URL arrives.
    // We manage the <video> element entirely imperatively inside lmContainerRef so
    // React never tries to reconcile Plyr's restructured DOM (which causes the
    // removeChild NotFoundError when the episode changes and React re-renders).
    useEffect(() => {
        if (!lmUrl || !lmContainerRef.current) return;
        // Tear down any existing instances first
        if (plyrRef.current) { plyrRef.current.destroy(); plyrRef.current = null; }
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        const container = lmContainerRef.current;
        container.innerHTML = ''; // wipe previous Plyr wrapper completely
        // Suppress party pushes during the source-change reinit — the tearing-
        // down old player + buffering new one fires spurious pause/play events.
        partySettleUntilRef.current = Date.now() + 2500;

        // Create a fresh <video> element — React never touches this node
        const video = document.createElement('video');
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.width = '100%';
        video.style.height = '100%';
        // AirPlay-friendly attributes; ignored by non-Safari browsers
        video.setAttribute('x-webkit-airplay', 'allow');
        video.setAttribute('airplay', 'allow');
        container.appendChild(video);
        videoRef.current = video;

        // ── Cast / AirPlay wiring ─────────────────────────────────────────────
        // Safari: webkitShowPlaybackTargetPicker on the <video> element drives AirPlay.
        // Chromium (Brave/Chrome): Google Cast SDK runs independently of the video
        // element — its state lives on castContextRef and survives episode changes.
        // Re-seed from the SDK so the button doesn't flicker off when the video reloads.
        const CastState = window.cast?.framework?.CastState;
        const ctx = castContextRef.current;
        const sdkState = ctx && CastState ? ctx.getCastState() : null;
        const sdkAvailable = !!(sdkState && sdkState !== CastState.NO_DEVICES_AVAILABLE);
        const sdkConnected = !!(CastState && sdkState === CastState.CONNECTED);
        setCastSupported(sdkAvailable);
        setCastConnected(sdkConnected);

        const hasAirplayPicker = typeof video.webkitShowPlaybackTargetPicker === 'function';
        if (hasAirplayPicker) setCastSupported(true);

        let availabilityCallbackId = null;
        if (video.remote && typeof video.remote.watchAvailability === 'function') {
            video.remote.watchAvailability(avail => { if (avail) setCastSupported(true); })
                .then(id => { availabilityCallbackId = id; })
                .catch(() => {});
        }

        const handleRemoteConnect = () => setCastConnected(true);
        const handleRemoteDisconnect = () => setCastConnected(false);
        const handleAirplayChange = (e) => {
            // 'current' = casting, 'none' = local
            setCastConnected(video.webkitCurrentPlaybackTargetIsWireless === true);
        };
        if (video.remote) {
            video.remote.addEventListener('connecting', handleRemoteConnect);
            video.remote.addEventListener('connect', handleRemoteConnect);
            video.remote.addEventListener('disconnect', handleRemoteDisconnect);
        }
        video.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
            if (e.availability === 'available') setCastSupported(true);
        });
        video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', handleAirplayChange);

        const subtitleLangCode = (sub, index) => {
            const raw = String(sub.language || sub.lang || sub.label || '').toLowerCase();
            const file = String(sub.file || sub.url || '').toLowerCase();
            const text = `${raw} ${file}`;
            const languageMap = [
                ['en', /\b(en|eng|english)\b/],
                ['es', /\b(es|spa|spanish|espanol|español)\b/],
                ['fr', /\b(fr|fre|fra|french)\b/],
                ['de', /\b(de|ger|deu|german)\b/],
                ['it', /\b(it|ita|italian)\b/],
                ['pt', /\b(pt|por|portuguese)\b/],
                ['nl', /\b(nl|dut|nld|dutch)\b/],
                ['ru', /\b(ru|rus|russian)\b/],
                ['uk', /\b(uk|ukr|ukrainian)\b/],
                ['cs', /\b(cs|cze|ces|czech)\b/],
                ['el', /\b(el|gre|ell|greek)\b/],
                ['hi', /\b(hi|hin|hindi)\b/],
                ['id', /\b(id|ind|indonesian)\b/],
                ['ja', /\b(ja|jpn|japanese)\b/],
                ['ko', /\b(ko|kor|korean)\b/],
                ['zh', /\b(zh|chi|zho|chinese)\b/],
            ];
            const directTag = raw.match(/\b([a-z]{2})(?:[-_][a-z]{2})?\b/)?.[1];
            if (directTag && languageMap.some(([tag]) => tag === directTag)) return directTag;
            return languageMap.find(([, re]) => re.test(text))?.[0] || (index === 0 ? 'en' : 'und');
        };

        // Hls.js/desktop uses HTML text tracks. Native iOS uses HLS subtitle
        // renditions injected into the manifest instead; mixing both creates
        // duplicate menu items and can leave AVPlayer selecting a non-rendering track.
        const uniqueSubs = lmSubtitles;
        let trackIndex = 0;
        if (Hls.isSupported()) {
            uniqueSubs.forEach(sub => {
                const rawSub = String(sub.file || sub.url || '');
                if (!rawSub.startsWith('/') && !rawSub.startsWith('http')) return;
                const absSubUrl = rawSub.startsWith('http') ? rawSub : `https://www.lookmovie2.to${rawSub}`;
                const trackEl = document.createElement('track');
                trackEl.kind = 'subtitles';
                trackEl.label = sub.language || sub.lang || `Track ${trackIndex + 1}`;
                trackEl.srclang = subtitleLangCode(sub, trackIndex);
                trackEl.src = `https://goldenhind.tech/proxy/subtitle?url=${encodeURIComponent(absSubUrl)}`;
                if (trackIndex === 0) trackEl.default = true;
                const isDefaultTrack = trackIndex === 0;
                trackEl.addEventListener('load', () => {
                    const offset = subOffsetRef.current;
                    if (offset !== 0 && trackEl.track?.cues) {
                        Array.from(trackEl.track.cues).forEach(cue => {
                            cue.startTime = Math.max(0, cue.startTime + offset);
                            cue.endTime = Math.max(0, cue.endTime + offset);
                        });
                    }
                    if (isDefaultTrack && trackEl.track) trackEl.track.mode = 'showing';
                });
                video.appendChild(trackEl);
                if (isDefaultTrack && trackEl.track) trackEl.track.mode = 'showing';
                trackIndex++;
            });
        }

        const posKey = type === 'tv'
            ? `playbackPos_${id}_s${season}_e${episode}`
            : `playbackPos_${id}`;

        const initPlyr = () => {
            const savedVolume = parseFloat(localStorage.getItem('playerVolume'));
            const savedSpeed = parseFloat(localStorage.getItem('playerSpeed'));
            const localPos = parseFloat(localStorage.getItem(posKey) || '0');
            // Resume to the furthest of local and server-recorded positions so
            // progress made on another device is honoured.
            const savedPos = Math.max(isNaN(localPos) ? 0 : localPos, resumePosRef.current || 0);

            const player = new Plyr(video, {
                controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'fullscreen'],
                settings: ['captions', 'quality', 'speed'],
                captions: { active: uniqueSubs.length > 0, update: true, language: 'sub0' },
                ratio: '16:9',
                keyboard: { focused: false, global: false },
                fullscreen: { enabled: true, fallback: true, iosNative: true },
                volume: isNaN(savedVolume) ? 1 : Math.min(1, Math.max(0, savedVolume)),
                speed: { selected: isNaN(savedSpeed) ? 1 : savedSpeed, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
            });
            plyrRef.current = player;

            // ── Heuristic title-screen / credits detector ─────────────────
            // Samples a 32×18 offscreen canvas once a second during the last
            // 20% of a TV episode. A frame counts as "credits-like" if it's
            // either dark (scrolling credits) OR barely changing from the
            // previous frame (static end-card / freeze-frame credits). Five
            // such seconds in a row triggers up-next early. Runs regardless of
            // the Auto-Next toggle so the popup appears; whether it auto-
            // advances still respects the user's countdown / cancel.
            if (type === 'tv') {
                const creditsCanvas = document.createElement('canvas');
                creditsCanvas.width = 32;
                creditsCanvas.height = 18;
                const creditsCtx = creditsCanvas.getContext('2d', { willReadFrequently: true });
                let score = 0;
                let prevData = null;
                let detectorTainted = false;
                if (creditsIntervalRef.current) clearInterval(creditsIntervalRef.current);
                creditsIntervalRef.current = setInterval(() => {
                    if (!video || video.readyState < 2 || !isFinite(video.duration) || video.duration === 0) return;
                    const pct = video.currentTime / video.duration;
                    const { episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
                    // Credits detection drives the up-next countdown on its own,
                    // independent of the Auto Next toggle — once we visually
                    // detect the title/credits screen we always offer the skip.
                    const hasNext = parseInt(ep) < parseInt(mEp) || parseInt(se) < parseInt(mSe);

                    if (detectorTainted) {
                        if (creditsDebugEnabled) setCreditsDebug({ pct, mean: null, motion: null, score, tainted: true });
                        return;
                    }

                    let mean = null, motion = null, creditsLike = false;
                    try {
                        creditsCtx.drawImage(video, 0, 0, 32, 18);
                        const data = creditsCtx.getImageData(0, 0, 32, 18).data;
                        let sum = 0, diff = 0;
                        const pixels = data.length / 4;
                        for (let i = 0; i < data.length; i += 4) {
                            const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                            sum += luma;
                            if (prevData) {
                                diff += Math.abs(data[i] - prevData[i])
                                      + Math.abs(data[i + 1] - prevData[i + 1])
                                      + Math.abs(data[i + 2] - prevData[i + 2]);
                            }
                        }
                        mean = sum / pixels;
                        motion = prevData ? diff / (pixels * 3) : 999;
                        prevData = data;
                        // Dark frame OR a near-static scene while still playing.
                        creditsLike = !video.paused && pct >= 0.80 && (mean < 60 || motion < 3.5);
                    } catch {
                        detectorTainted = true;
                        if (creditsDebugEnabled) setCreditsDebug({ pct, mean: null, motion: null, score, tainted: true });
                        return;
                    }

                    if (creditsLike && hasNext && !upNextInfoRef.current) score++;
                    else if (!creditsLike) score = Math.max(0, score - 1);

                    if (creditsDebugEnabled) {
                        setCreditsDebug({
                            pct: +pct.toFixed(3),
                            mean: mean == null ? null : +mean.toFixed(1),
                            motion: motion == null ? null : +motion.toFixed(2),
                            score, hasNext, tainted: false,
                        });
                    }

                    if (score >= 5 && hasNext && !upNextInfoRef.current) {
                        score = 0;
                        const nextEp = parseInt(ep) < parseInt(mEp) ? parseInt(ep) + 1 : 1;
                        const nextSe = parseInt(ep) < parseInt(mEp) ? parseInt(se) : parseInt(se) + 1;
                        triggerUpNext(nextEp, nextSe);
                    }
                }, 1000);
            }

            // Watch party: push local play/pause/seek to peers and apply any
            // pending remote state that arrived before Plyr was ready. The
            // push reads the settled p.paused at debounce time, so transient
            // play↔pause cycles during buffering collapse correctly.
            player.on('play', () => pushPartyUpdateRef.current?.());
            player.on('pause', () => pushPartyUpdateRef.current?.());
            player.on('seeked', () => pushPartyUpdateRef.current?.());
            // Retry pending party state once playback metadata is available.
            // We hook several events so whichever fires first (or last after
            // any localStorage-restore handler) re-applies the host's state.
            // The 250ms setTimeout defers past other once-canplay handlers
            // that may set currentTime, ensuring the party seek wins.
            const retryParty = () => {
                if (!pendingPartyStateRef.current) return;
                applyPartyStateRef.current?.(pendingPartyStateRef.current);
                setTimeout(() => {
                    if (pendingPartyStateRef.current) {
                        applyPartyStateRef.current?.(pendingPartyStateRef.current);
                    }
                }, 250);
            };
            player.on('loadedmetadata', retryParty);
            player.on('canplay', retryParty);
            player.on('playing', retryParty);

            // Portal the up-next / skip overlays into the fullscreen element so
            // they're visible in desktop fullscreen. iOS native fullscreen uses
            // the OS video player and can't host HTML overlays — nothing to do
            // there. Falls back to document.fullscreenElement if Plyr doesn't
            // expose its container.
            player.on('enterfullscreen', () => {
                setFsHost(player.elements?.container || document.fullscreenElement || null);
            });
            player.on('exitfullscreen', () => setFsHost(null));

            // Skip-overlay autohide.
            // The listener has to be on the common ancestor of both the video
            // container AND the .lm-skip-overlay (they're siblings under
            // .watch-player). If we attach to the video container alone,
            // mousemove from the skip buttons doesn't bubble there, the timer
            // expires, pointer-events drops off the buttons mid-hover, and
            // the cursor oscillates between button and the now-invisible
            // overlay — flicker loop + missed clicks.
            setControlsVisible(true);
            const refreshSkipIdle = () => {
                setControlsVisible(true);
                if (skipIdleTimerRef.current) clearTimeout(skipIdleTimerRef.current);
                skipIdleTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
            };
            const onPointerLeavePlayer = () => {
                if (skipIdleTimerRef.current) clearTimeout(skipIdleTimerRef.current);
                setControlsVisible(false);
            };
            const listenTarget = watchPlayerRef.current || container;
            listenTarget.addEventListener('mousemove', refreshSkipIdle);
            listenTarget.addEventListener('mouseenter', refreshSkipIdle);
            listenTarget.addEventListener('mouseleave', onPointerLeavePlayer);
            player.on('controlsshown', refreshSkipIdle);
            skipIdleCleanupRef.current = () => {
                if (skipIdleTimerRef.current) clearTimeout(skipIdleTimerRef.current);
                skipIdleTimerRef.current = null;
                listenTarget.removeEventListener('mousemove', refreshSkipIdle);
                listenTarget.removeEventListener('mouseenter', refreshSkipIdle);
                listenTarget.removeEventListener('mouseleave', onPointerLeavePlayer);
            };
            refreshSkipIdle();

            // Inject a cast button into Plyr's bottom control bar so users can
            // start/stop casting from inside the player itself (alongside
            // captions/settings/pip/fullscreen). Visibility is updated by the
            // useEffect on [castSupported, castConnected] below.
            const controlsEl = container.querySelector('.plyr__controls');
            const fullscreenBtn = controlsEl?.querySelector('[data-plyr="fullscreen"]');
            if (controlsEl) {
                const castBtn = document.createElement('button');
                castBtn.type = 'button';
                castBtn.className = 'plyr__control plyr__control--cast';
                castBtn.setAttribute('aria-label', 'Cast');
                castBtn.style.display = 'none';
                castBtn.innerHTML = '<svg viewBox="0 0 24 24" role="presentation" focusable="false" aria-hidden="true"><path fill="currentColor" d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/></svg>';
                castBtn.addEventListener('click', (e) => { e.preventDefault(); handleCast(); });
                if (fullscreenBtn) controlsEl.insertBefore(castBtn, fullscreenBtn);
                else controlsEl.appendChild(castBtn);
                inPlayerCastBtnRef.current = castBtn;
            }

            // Restore playback position (skip if < 5s to avoid replaying a fresh start).
            // Skipped entirely when in a watch party — the party's state is the
            // authority and applying both fights over `currentTime` on canplay.
            if (savedPos > 5 && !partyRoomIdRef.current) {
                video.addEventListener('canplay', () => { video.currentTime = savedPos; }, { once: true });
            }

            // Save position every 5 seconds while playing; show up-next popup at 95%
            let lastSaved = 0;
            let lastServerSaved = 0;
            let upNextShown = false;
            player.on('timeupdate', () => {
                const now = Date.now();
                if (now - lastSaved > 5000 && player.currentTime > 5) {
                    lastSaved = now;
                    localStorage.setItem(posKey, player.currentTime);
                    // Series-level percentage for the Continue Watching cards on /app.
                    // Tracks the *currently watching* episode/movie regardless of season.
                    if (player.duration > 0) {
                        const pct = Math.min(1, Math.max(0, player.currentTime / player.duration));
                        localStorage.setItem('playbackPct_' + id, pct.toFixed(3));
                    }
                }
                // Persist to the server less often (every 15s) so resume works
                // across devices without hammering the API.
                if (now - lastServerSaved > 15000 && player.currentTime > 5 && player.duration > 0) {
                    lastServerSaved = now;
                    const u = localStorage.getItem('user'), t = localStorage.getItem('token');
                    if (u && t) {
                        axios.post('https://goldenhind.tech/position/update', {
                            user: u, token: t, posKey, contentId: id,
                            position: player.currentTime, duration: player.duration,
                            pct: Math.min(1, Math.max(0, player.currentTime / player.duration)),
                        }).catch(() => {});
                    }
                }
                const { autoNext: an, episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
                if (an === 1 && !upNextShown && player.duration > 0) {
                    // For episodes over 20 min, end credits typically run ~60–90s.
                    // Fire up-next 90s before the end so the viewer doesn't sit
                    // through the entire credit roll. For short content (≤20min)
                    // a fixed window would trigger too early, so fall back to 95%.
                    const remaining = player.duration - player.currentTime;
                    const longContent = player.duration > 1200;
                    const creditsReached = longContent
                        ? remaining <= 90
                        : player.currentTime / player.duration >= 0.95;
                    if (creditsReached) {
                        const hasNext = parseInt(ep) < parseInt(mEp) || parseInt(se) < parseInt(mSe);
                        if (hasNext) {
                            upNextShown = true;
                            const nextEp = parseInt(ep) < parseInt(mEp) ? parseInt(ep) + 1 : 1;
                            const nextSe = parseInt(ep) < parseInt(mEp) ? parseInt(se) : parseInt(se) + 1;
                            triggerUpNext(nextEp, nextSe);
                        }
                    }
                }
            });

            // Persist volume and speed preferences across sessions
            player.on('volumechange', () => localStorage.setItem('playerVolume', player.volume));
            player.on('ratechange', () => localStorage.setItem('playerSpeed', player.speed));

            // Auto-next for provider 4 — execute immediately on end (popup already showing from 95%)
            player.on('ended', () => {
                localStorage.removeItem(posKey);
                localStorage.removeItem('playbackPct_' + id);
                // Reset the server-side resume position so finished content
                // doesn't reopen mid-credits next time.
                resumePosRef.current = 0;
                const u = localStorage.getItem('user'), t = localStorage.getItem('token');
                if (u && t) {
                    axios.post('https://goldenhind.tech/position/update', {
                        user: u, token: t, posKey, contentId: id, position: 0, duration: 0, pct: 0,
                    }).catch(() => {});
                }
                const { autoNext: an, episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
                if (an !== 1) return;
                if (upNextInfoRef.current) {
                    executeUpNextRef.current?.();
                } else {
                    // fallback if 95% trigger didn't fire
                    const nextEp = parseInt(ep) < parseInt(mEp) ? parseInt(ep) + 1 : 1;
                    const nextSe = parseInt(ep) < parseInt(mEp) ? parseInt(se) : parseInt(se) + 1;
                    if (parseInt(ep) < parseInt(mEp) || parseInt(se) < parseInt(mSe)) {
                        upNextInfoRef.current = { targetEpisode: nextEp, targetSeason: nextSe };
                        executeUpNextRef.current?.();
                    }
                }
            });
        };

        if (Hls.isSupported()) {
            const hls = new Hls({ xhrSetup: xhr => { xhr.withCredentials = false; } });
            hlsRef.current = hls;
            hls.loadSource(lmUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                initPlyr();
                plyrRef.current?.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (!data.fatal) return;
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        hlsRef.current = null;
                        break;
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = lmUrl;
            initPlyr();
            video.play().catch(() => {});
        }

        return () => {
            if (video.remote) {
                video.remote.removeEventListener('connecting', handleRemoteConnect);
                video.remote.removeEventListener('connect', handleRemoteConnect);
                video.remote.removeEventListener('disconnect', handleRemoteDisconnect);
                if (availabilityCallbackId !== null && typeof video.remote.cancelWatchAvailability === 'function') {
                    video.remote.cancelWatchAvailability(availabilityCallbackId).catch(() => {});
                }
            }
            video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', handleAirplayChange);
            if (skipIdleCleanupRef.current) { skipIdleCleanupRef.current(); skipIdleCleanupRef.current = null; }
            if (creditsIntervalRef.current) { clearInterval(creditsIntervalRef.current); creditsIntervalRef.current = null; }
            setFsHost(null);
            // Don't reset cast state to false — Cast SDK session may still be active
            // independently of this <video> element. The CAST_STATE_CHANGED listener
            // and the next mount's re-seed handle correctness.
            setCastSupported(castDeviceAvailableRef.current);
            if (plyrRef.current) { plyrRef.current.destroy(); plyrRef.current = null; }
            if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
            container.innerHTML = '';
            videoRef.current = null;
            inPlayerCastBtnRef.current = null;
        };
    }, [lmUrl]);

    // Keep the in-player cast button (injected into Plyr's control bar) in
    // sync with React-side cast availability and connection state.
    useEffect(() => {
        const btn = inPlayerCastBtnRef.current;
        if (!btn) return;
        btn.style.display = castSupported ? '' : 'none';
        btn.dataset.casting = castConnected ? 'true' : 'false';
        btn.setAttribute('aria-label', castConnected ? 'Stop casting' : 'Cast to a nearby device');
    }, [castSupported, castConnected]);

    const handleCast = () => {
        const v = videoRef.current;
        // Prefer AirPlay picker on Safari (more reliable than remote.prompt there)
        if (v && typeof v.webkitShowPlaybackTargetPicker === 'function') {
            try { v.webkitShowPlaybackTargetPicker(); return; } catch {}
        }
        // Google Cast SDK path (Brave/Chrome/Edge)
        const ctx = castContextRef.current;
        if (ctx && window.cast?.framework && window.chrome?.cast) {
            const existing = ctx.getCurrentSession();
            if (existing) {
                ctx.endCurrentSession(true);
                setCastConnected(false);
                return;
            }
            ctx.requestSession().then(() => {
                const session = ctx.getCurrentSession();
                const url = lmUrlRef.current;
                if (!session || !url) return;
                const cm = window.chrome.cast.media;
                const mediaInfo = new cm.MediaInfo(url, 'application/x-mpegURL');
                mediaInfo.streamType = cm.StreamType.BUFFERED;

                // Attach subtitle tracks. The receiver fetches these URLs directly,
                // so they must serve WebVTT with permissive CORS (the existing
                // /proxy/subtitle endpoint handles both).
                const subs = lmSubtitlesRef.current || [];
                const tracks = [];
                subs.forEach((sub, idx) => {
                    const raw = String(sub.file || sub.url || '');
                    if (!raw.startsWith('/') && !raw.startsWith('http')) return;
                    const abs = raw.startsWith('http') ? raw : `https://www.lookmovie2.to${raw}`;
                    const proxied = `https://goldenhind.tech/proxy/subtitle?url=${encodeURIComponent(abs)}`;
                    const t = new cm.Track(idx + 1, cm.TrackType.TEXT);
                    t.trackContentId = proxied;
                    t.trackContentType = 'text/vtt';
                    t.subtype = cm.TextTrackType.SUBTITLES;
                    t.name = sub.language || sub.lang || `Track ${idx + 1}`;
                    t.language = String(sub.language || sub.lang || 'en').toLowerCase().slice(0, 2);
                    tracks.push(t);
                });
                if (tracks.length > 0) {
                    mediaInfo.tracks = tracks;
                    const style = new cm.TextTrackStyle();
                    style.backgroundColor = '#00000080';
                    style.foregroundColor = '#FFFFFFFF';
                    style.edgeType = cm.TextTrackEdgeType.OUTLINE;
                    style.fontScale = 1.0;
                    mediaInfo.textTrackStyle = style;
                }

                const req = new cm.LoadRequest(mediaInfo);
                const v2 = videoRef.current;
                if (v2 && v2.currentTime > 5) req.currentTime = v2.currentTime;
                if (tracks.length > 0) req.activeTrackIds = [1]; // default first track on
                session.loadMedia(req).then(() => {
                    setCastConnected(true);
                    try { v2?.pause(); } catch {}
                }).catch(() => {});
            }).catch(() => {});
            return;
        }
        // Final fallback: standard Remote Playback API
        if (v && v.remote && typeof v.remote.prompt === 'function') {
            v.remote.prompt().catch(() => {});
        }
    };

    // Download the current movie/episode as an MP4. The server remuxes the
    // LookMovie HLS stream on the fly and returns it as an attachment, so we
    // just point an anchor at the authenticated URL.
    const handleDownload = () => {
        const u = localStorage.getItem('user'), t = localStorage.getItem('token');
        if (!u || !t) return;
        const params = new URLSearchParams({ user: u, token: t, id });
        if (type === 'tv') { params.set('season', season); params.set('episode', episode); }
        const a = document.createElement('a');
        a.href = `https://goldenhind.tech/download/video?${params.toString()}`;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showProviderToast('Preparing download… this can take a moment to start.');
    };

    // Skip helpers
    const triggerFlash = (dir) => {
        setSkipFlash(dir);
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setSkipFlash(null), 700);
    };
    const handleSkipBack = () => {
        const p = plyrRef.current;
        if (!p) return;
        p.currentTime = Math.max(0, p.currentTime - 10);
        triggerFlash('back');
    };
    const handleSkipForward = () => {
        const p = plyrRef.current;
        if (!p) return;
        p.currentTime = Math.min(p.duration || 0, p.currentTime + 10);
        triggerFlash('forward');
    };

    // ── Up-next countdown helpers ────────────────────────────────────────────────

    const triggerUpNext = (targetEpisode, targetSeason) => {
        upNextInfoRef.current = { targetEpisode, targetSeason };
        setUpNextInfo({ targetEpisode, targetSeason });
        setUpNextSeconds(5);
        // Start the 5s countdown immediately so the popup auto-advances unless
        // the user clips it. Works for all providers, not just iframe ones.
        setUpNextCounting(true);
        // Refetch metadata for the exact target so the popup always shows the
        // right title — the [season,episode] useEffect can race with rapid
        // episode advances and leave nextEpData pointing at the wrong one.
        if (type === 'tv') {
            const u = localStorage.getItem('user'), t = localStorage.getItem('token');
            axios.post('https://goldenhind.tech/eretrieve', {
                user: u, token: t, series: vidID,
                season: targetSeason, episode: targetEpisode,
            }).then(r => setNextEpData({ name: r.data.name, still_path: r.data.still_path }))
              .catch(() => {});
        }
    };

    const cancelUpNext = () => {
        upNextInfoRef.current = null;
        setUpNextInfo(null);
        setUpNextCounting(false);
        clearInterval(upNextTimerRef.current);
        upNextTimerRef.current = null;
    };

    const showProviderToast = (msg) => {
        clearTimeout(providerToastTimerRef.current);
        setProviderToast(msg);
        providerToastTimerRef.current = setTimeout(() => setProviderToast(null), 4000);
    };

    // Countdown only runs for iframe providers (provider 4 executes immediately on ended)
    useEffect(() => {
        if (!upNextCounting || !upNextInfo) return;
        clearInterval(upNextTimerRef.current);
        upNextTimerRef.current = setInterval(() => {
            setUpNextSeconds(s => {
                if (s <= 1) {
                    clearInterval(upNextTimerRef.current);
                    upNextTimerRef.current = null;
                    executeUpNextRef.current?.();
                    return 5;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(upNextTimerRef.current);
    }, [upNextCounting, upNextInfo]);

    // Keyboard shortcuts for provider 4
    useEffect(() => {
        if (parseInt(provider) !== 1) return;
        const onKey = (e) => {
            const p = plyrRef.current;
            if (!p) return;
            if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    p.currentTime = Math.min(p.duration || 0, p.currentTime + 10);
                    triggerFlash('forward');
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    p.currentTime = Math.max(0, p.currentTime - 10);
                    triggerFlash('back');
                    break;
                case ' ':
                case 'k':
                case 'K':
                    e.preventDefault();
                    p.togglePlay();
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    p.muted = !p.muted;
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    p.fullscreen.toggle();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    p.volume = Math.min(1, p.volume + 0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    p.volume = Math.max(0, p.volume - 0.1);
                    break;

            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [provider]);

    // Keep a live snapshot of playback state so event handler closures never go stale
    useEffect(() => {
        playbackStateRef.current = { autoNext, episode, season, maxEp, maxSe };
    }, [autoNext, episode, season, maxEp, maxSe]);

    // Block ad pop-ups from iframe providers — run once on mount
    useEffect(() => {
        const originalOpen = window.open;
        window.open = () => { console.log("window!"); };
        return () => { window.open = originalOpen; };
    }, []);

    // Auto-next for iframe providers (1–3) — show popup + start countdown on ended
    useEffect(() => {
        const handler = (event) => {
            if (event.data?.data?.event !== 'ended') return;
            const { autoNext: an, episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
            if (an !== 1) return;
            const nextEp = parseInt(ep) < parseInt(mEp) ? parseInt(ep) + 1 : 1;
            const nextSe = parseInt(ep) < parseInt(mEp) ? parseInt(se) : parseInt(se) + 1;
            if (parseInt(ep) < parseInt(mEp) || parseInt(se) < parseInt(mSe)) {
                triggerUpNext(nextEp, nextSe);
                setUpNextCounting(true);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Keep panelSeason in sync and update maxEp when season changes
    useEffect(() => {
        setPanelSeason(parseInt(season));
        const cur = seriesData?.seasons?.find(s => s.season_number === parseInt(season));
        if (cur?.episode_count) {
            setMaxEp(cur.episode_count);
        } else if (vidID && type === 'tv') {
            const u = localStorage.getItem('user'), t = localStorage.getItem('token');
            axios.post('https://goldenhind.tech/season', { user: u, token: t, seriesId: vidID, seasonNumber: parseInt(season) })
                .then(res => { const c = res.data?.episodes?.length; if (c) setMaxEp(c); })
                .catch(() => {});
        }
    }, [season, seriesData]);

    // Shift subtitle cue times when the user adjusts the offset.
    // subOffsetRef tracks the offset already applied so only the delta is added each time.
    useEffect(() => {
        const vid = videoRef.current;
        if (!vid) return;
        const delta = subOffset - subOffsetRef.current;
        subOffsetRef.current = subOffset;
        if (delta === 0) return;
        Array.from(vid.textTracks || []).forEach(textTrack => {
            const cues = textTrack.cues;
            if (!cues) return;
            Array.from(cues).forEach(cue => {
                cue.startTime = Math.max(0, cue.startTime + delta);
                cue.endTime = Math.max(0, cue.endTime + delta);
            });
        });
    }, [subOffset]);

    if (type == "m") {
        type = "movie"
    } else if (type == "t") {
        type = "tv"
    } else {
        useEffect(() => {
            navigate('/app')
        })
    }

    let video = '';
    if (!(id == null)) {
        if (provider == 2) {
            if (type == 'movie') {
                video = `https://vidlink.pro/${type}/${vidID}/?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=false&poster=true`
            } else {
                video = `https://vidlink.pro/${type}/${vidID}/${season}/${episode}?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=${autoPlay == 1 ? "true" : "false"}&poster=true${autoPlay == 1 ? "&startAt=0" : ""}`
            }
        } else if (provider == 3) {
            if (type == 'movie') {
                video = `https://vidsrc.me/embed/${type}?tmdb=${vidID}`
            } else {
                video = `https://vidsrc.me/embed/${type}?tmdb=${vidID}&season=${season}&episode=${episode}&autoplay=${autoPlay}`
            }
        }
        
    }
    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")
    let autoNextState = localStorage.getItem("autoNext")
    

    useEffect(() => {
        if (autoNextState == null) {
            localStorage.setItem("autoNext", "0")
        } else {
            setAutoNext(parseInt(autoNextState))
        }

        if (user == null) {
            navigate('/auth')
        }

        if (!(localStorage.getItem("provider" + vidID) == null)) {
            const saved = parseInt(localStorage.getItem("provider" + vidID));
            if (saved >= 1 && saved <= 3) {
                setProvider(saved)
            } else {
                localStorage.setItem("provider" + vidID, 1)
                setProvider(1)
            }
        }

        if (type == "movie") {
            if (!(vidID == movID) && !(vidID == null) && !(vidID == "")) {
                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/mretrieve',
                    data: {
                        user: user,
                        token: token,
                        movie: vidID,
                    }
                }).then((response) => {
                    setMovID(vidID)
                    const ToData = response.data
                    setVotes(response.data.vote_average)
                    setData(ToData)
                    console.log(response.data)
                    let result = response.data
                    result.name == null ? (result.title == null ? document.title = "The Golden Hind" : document.title = result.title) : document.title = result.name
                });

                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/similar',
                    data: {
                        user: user,
                        token: token,
                        ID: id,
                    }
                }).then((response) => {
                    setSimilarData(response.data)
                    
                });
            }
        } else if (type == "tv") {
            if (!((vidID + episode + season) == episodeID) && !(vidID == null) && !(vidID == "")) {
                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/eretrieve',
                    data: {
                        user: user,
                        token: token,
                        series: vidID,
                        season: season,
                        episode: episode
                    }
                }).then((response) => {
                    setEpisodeID(vidID + episode + season)
                    const ToData = response.data
                    setVotes(response.data.vote_average)
                    setData(ToData)             
                });
            }

            if (!(vidID == seriesID)  && !(vidID == null) && !(vidID == "")){
                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/sretrieve',
                    data: {
                        user: user,
                        token: token,
                        series: vidID,
                    }
                }).then((response) => {
                    setSeriesID(vidID)
                    const ToData = response.data
                    console.log(response.data.seasons)
                    setSeriesData(ToData)
                    let result = response.data
                    result.name == null ? (result.title == null ? document.title = "The Golden Hind" : document.title = result.title) : document.title = result.name  
                    const regularSeasons = ToData.seasons?.filter(s => s.season_number > 0) ?? [];
                    setMaxSe(ToData.number_of_seasons ?? regularSeasons.length ?? 1);
                    const curSeason = regularSeasons.find(s => s.season_number === parseInt(season));
                    if (curSeason?.episode_count) {
                        setMaxEp(curSeason.episode_count);
                    } else {
                        axios.post('https://goldenhind.tech/season', { user, token, seriesId: vidID, seasonNumber: parseInt(season) })
                            .then(res => { const c = res.data?.episodes?.length; if (c) setMaxEp(c); })
                            .catch(() => {});
                    }
                });

                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/similar',
                    data: {
                        user: user,
                        token: token,
                        ID: id,
                    }
                }).then((response) => {
                    setSimilarData(response.data)
                });
            }

            if (first == 0) {
                console.log("Retrieving data")
                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/progress_retrieve',
                    data: {
                        user: user,
                        token: token,
                        progID: id
                    }
                }).then((response) => {
                    const ToData = response.data
                    if (ToData !== "VNF") {
                        if (location.state !== null) { // If we're redirecting from the details page, use the season/episode from the URL instead of the saved progress so we don't override the user's intended jump with old progress data. This allows users to click on a specific episode from the details page and have it load correctly instead of always loading their last position in that series.
                            const [season, episode] = location.state.status.split(';');
                            localStorage.setItem("episode" + id, episode)
                            localStorage.setItem("season" + id, season)
                            setSeason(season);
                            setEpisode(episode);
                        } else {
                            localStorage.setItem("episode" + id, response.data.episode)
                            localStorage.setItem("season" + id, response.data.season)
                            setSeason(response.data.season)
                            setEpisode(response.data.episode)
                        }           
                    }
                    setProgressReady(true);
                }).catch(() => {
                    setProgressReady(true); // unblock even if the request fails
                });
                setFirst(1)
            } else {
                axios({
                    method: 'post',
                    url: 'https://goldenhind.tech/progress_update',
                    data: {
                        user: user,
                        token: token,
                        progID: id,
                        progStatus: String(season).concat(";").concat(episode)
                    }
                })
            }

            

            if (season == 1 && episode == 1) {
                if (localStorage.getItem("episode" + id)) {
                    if (!(localStorage.getItem("episode" + id) == episode)) {
                        

                        setEpisode(localStorage.getItem("episode" + id))
                    }
                } else {
                    
                    localStorage.setItem("episode" + id, episode)
                }
    
                if (localStorage.getItem("season" + id)) {
                    if (!(localStorage.getItem("season" + id) == season)) {
                        setSeason(localStorage.getItem("season" + id))
                    }
                } else {
                    localStorage.setItem("season" + id, season)
                }
            }
        }

        if (!(localStorage.getItem("bookmarks").indexOf(id) == -1) && bookmarked == -1) {
            setBookmark(1)
        }

        try {
            const mylistRaw = localStorage.getItem("mylist");
            const mylistArr = mylistRaw ? JSON.parse(mylistRaw) : [];
            if (mylistArr.includes(id) && myListed == -1) {
                setMyListed(1);
            }
        } catch {}


    })




    function Bookmark() {
        let bookmarks = localStorage.getItem("bookmarks")
        bookmarks = JSON.parse(bookmarks)

        if (bookmarks.indexOf(id) == -1) {
            bookmarks.push(id)
            bookmarks = JSON.stringify(bookmarks)
            localStorage.setItem("bookmarks", bookmarks)

            axios({
                method: 'post',
                url: 'https://goldenhind.tech/favourite',
                data: {
                    user: user,
                    token: token,
                    favId: id,
                }
            });
            setBookmark(1)
        } else {
            bookmarks.splice(bookmarks.indexOf(id), 1)
            bookmarks = JSON.stringify(bookmarks)
            localStorage.setItem("bookmarks", bookmarks)

            axios({
                method: 'post',
                url: 'https://goldenhind.tech/unfavourite',
                data: {
                    user: user,
                    token: token,
                    favId: id,
                }
            });
            setBookmark(-1)
        }
    }

    function MyList() {
        try {
            const raw = localStorage.getItem("mylist");
            const arr = raw ? JSON.parse(raw) : [];
            if (!arr.includes(id)) {
                arr.push(id);
                localStorage.setItem("mylist", JSON.stringify(arr));
                axios.post('https://goldenhind.tech/mylist/add', { user, token, itemId: id });
                setMyListed(1);
            } else {
                const filtered = arr.filter(x => x !== id);
                localStorage.setItem("mylist", JSON.stringify(filtered));
                axios.post('https://goldenhind.tech/mylist/remove', { user, token, itemId: id });
                setMyListed(-1);
            }
        } catch {}
    }



    const handlePrevEp = () => {
        if (parseInt(episode) > 1) {
            const prev = parseInt(episode) - 1;
            localStorage.setItem('episode' + id, prev);
            setEpisode(prev);
            pushPartyEpisodeNow(season, prev);
        } else if (parseInt(season) > 1) {
            const prevSe = parseInt(season) - 1;
            const prevSeasonInfo = seriesData?.seasons?.find(s => s.season_number === prevSe);
            if (prevSeasonInfo?.episode_count) {
                const lastEp = prevSeasonInfo.episode_count;
                localStorage.setItem('season' + id, prevSe);
                localStorage.setItem('episode' + id, lastEp);
                setSeason(prevSe);
                setEpisode(lastEp);
                pushPartyEpisodeNow(prevSe, lastEp);
            } else {
                const u = localStorage.getItem('user'), t = localStorage.getItem('token');
                axios.post('https://goldenhind.tech/season', { user: u, token: t, seriesId: vidID, seasonNumber: prevSe })
                    .then(res => {
                        const lastEp = res.data?.episodes?.length || 1;
                        localStorage.setItem('season' + id, prevSe);
                        localStorage.setItem('episode' + id, lastEp);
                        setSeason(prevSe);
                        setEpisode(lastEp);
                        pushPartyEpisodeNow(prevSe, lastEp);
                    })
                    .catch(() => {
                        localStorage.setItem('season' + id, prevSe);
                        localStorage.setItem('episode' + id, 1);
                        setSeason(prevSe);
                        setEpisode(1);
                        pushPartyEpisodeNow(prevSe, 1);
                    });
            }
        }
    };

    const handleNextEp = () => {
        if (parseInt(episode) < parseInt(maxEp)) {
            const next = parseInt(episode) + 1;
            localStorage.setItem('episode' + id, next);
            setEpisode(next);
            pushPartyEpisodeNow(season, next);
        } else if (parseInt(season) < parseInt(maxSe)) {
            const nextSe = parseInt(season) + 1;
            localStorage.setItem('season' + id, nextSe);
            localStorage.setItem('episode' + id, 1);
            setSeason(nextSe);
            setEpisode(1);
            pushPartyEpisodeNow(nextSe, 1);
        }
    };

    // async function HandleNextEpisode(eventType, episode, season, maxEp, maxSe, setSeason, setEpisode, currentTime, duration) {
    //     if (currentTime == duration) {
    //         console.log("it's over")
    //         if (episode == maxEp) {
    //             if (season == maxSe) {
    //                 //It's the latest ep, do nothing.
    //             } else {
    //                 localStorage.setItem("season" + id, parseInt(season) + 1)
    //                 localStorage.setItem("episode" + id, 1)
    //                 setSeason(parseInt(season) + 1)
    //                 setEpisode(1)
    //             }
    //         } else {
    //             localStorage.setItem("episode" + id, parseInt(episode) + 1)
    //             setEpisode(parseInt(episode) + 1)
    //         }
    //     }
    // }

    
    // if (type == "tv" && !(document.getElementById("watch-player-file") == null)) {
    //     document.getElementById("watch-player-file").addEventListener("message" , async (event) => {
    //         console.log("Event!")
    
    //         if (event.data?.type === 'PLAYER_EVENT') {
    //             const { event: eventType, currentTime, duration } = event.data.data;
    //             console.log("actual event")
    //             // Handle the event
    //             await HandleNextEpisode(eventType, episode, season, maxEp, maxSe, setSeason, setEpisode, currentTime, duration)
    //         }
    //     })
    // }

    // Fetch next episode metadata for the up-next popup
    useEffect(() => {
        if (type !== 'tv' || !maxEp || !maxSe) return;
        const nextEp = parseInt(episode) < parseInt(maxEp) ? parseInt(episode) + 1 : 1;
        const nextSe = parseInt(episode) < parseInt(maxEp) ? parseInt(season) : parseInt(season) + 1;
        if (nextSe > parseInt(maxSe)) { setNextEpData(null); return; }
        axios.post('https://goldenhind.tech/eretrieve', { user, token, series: vidID, season: nextSe, episode: nextEp })
            .then(r => setNextEpData({ name: r.data.name, still_path: r.data.still_path }))
            .catch(() => setNextEpData(null));
    }, [episode, season, maxEp, maxSe]);

    const _regularSeasons = seriesData?.seasons?.filter(s => s.season_number > 0) ?? [];
    const effectiveMaxSe = seriesData?.number_of_seasons ?? (_regularSeasons.length || maxSe);
    const _curSeason = _regularSeasons.find(s => s.season_number === parseInt(season));
    const effectiveMaxEp = _curSeason?.episode_count || maxEp;

    // Keep executeUpNextRef current so Plyr event closures always call the latest version
    executeUpNextRef.current = () => {
        const info = upNextInfoRef.current;
        if (!info) return;
        upNextInfoRef.current = null;
        setUpNextInfo(null);
        setUpNextCounting(false);
        clearInterval(upNextTimerRef.current);
        upNextTimerRef.current = null;
        localStorage.setItem('episode' + id, info.targetEpisode);
        localStorage.setItem('season' + id, info.targetSeason);
        setEpisode(info.targetEpisode);
        setSeason(info.targetSeason);
        setAutoPlay(1);
        pushPartyEpisodeNow(info.targetSeason, info.targetEpisode);
    };

    return (
        <>
        <div className= "watch-main" id= "watch-main">
            {!(seriesData == null) ? (!(seriesData.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + seriesData.backdrop_path}/>  : null): null}
            {!(data == null) ? (!(data.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + data.backdrop_path}/>  : null): null}
            <Topbar/>
            <div className= "watch-holder" id= "watch-holder">
                <div className= "watch-system">
                <div className= "watch-player" ref={watchPlayerRef}>
                    {parseInt(provider) === 1 ? (
                        <>
                            {/* Container is always mounted so Plyr always has a live DOM node.
                                Loading / error states are absolute overlays on top. */}
                            <div
                                ref={lmContainerRef}
                                className="watch-player-file"
                                style={{ background: '#000', opacity: lmLoading ? 0 : 1, transition: 'opacity 0.3s' }}
                            />
                            {lmLoading && (
                                <div className="watch-lm-state" style={{position:'absolute',inset:0,zIndex:5}}>
                                    <div className="watch-lm-spinner"/>
                                    <p>Fetching LookMovie stream…</p>
                                </div>
                            )}
                            {lmError && !lmLoading && (
                                <div className="watch-lm-state watch-lm-error" style={{position:'absolute',inset:0,zIndex:5}}>
                                    <p>⚠ {lmError}</p>
                                </div>
                            )}
                            {(() => {
                                const overlays = (
                                    <>
                                        <div className={`lm-skip-overlay${controlsVisible ? ' visible' : ''}`}>
                                            <button className="lm-skip-btn lm-skip-back" onClick={handleSkipBack} aria-label="Back 10 seconds">
                                                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                                                </svg>
                                                <span className="lm-skip-label">10</span>
                                            </button>
                                            <button className="lm-skip-btn lm-skip-forward" onClick={handleSkipForward} aria-label="Forward 10 seconds">
                                                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{transform:'scaleX(-1)'}}>
                                                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                                                </svg>
                                                <span className="lm-skip-label">10</span>
                                            </button>
                                        </div>
                                        {skipFlash && (
                                            <div className={`lm-skip-flash lm-skip-flash-${skipFlash}`}>
                                                {skipFlash === 'forward' ? '+10s' : '−10s'}
                                            </div>
                                        )}
                                        {upNextInfo && (
                                            <div className="up-next-overlay">
                                                {nextEpData?.still_path && (
                                                    <img className="up-next-thumb" src={`https://image.tmdb.org/t/p/w300/${nextEpData.still_path}`} alt="" />
                                                )}
                                                <div className="up-next-info">
                                                    <span className="up-next-label">Up Next</span>
                                                    {nextEpData?.name && <span className="up-next-ep-name">{nextEpData.name}</span>}
                                                    {upNextCounting && <span className="up-next-text">Auto-playing in {upNextSeconds}s</span>}
                                                </div>
                                                <div className="up-next-actions">
                                                    <button className="up-next-play-now" onClick={() => executeUpNextRef.current?.()}>Play Now</button>
                                                    <button className="up-next-cancel" onClick={cancelUpNext}>✕</button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                                // In fullscreen, portal into the fullscreen element so the
                                // overlays render on top of the native fullscreen view.
                                return fsHost ? createPortal(overlays, fsHost) : overlays;
                            })()}
                        </>
                    ) : (
                        <iframe
                            referrerpolicy="origin"
                            className="watch-player-file"
                            id="watch-player-file"
                            src={video}
                            allowFullScreen="yes"
                            allow="autoplay"
                            style={{border: 'none'}}
                        ></iframe>
                    )}
                    {partyRoomId && (
                        <>
                            <div className="party-reactions-layer">
                                {partyReactions.map(r => (
                                    <span key={r.id} className="party-reaction-float" style={{ left: `${r.left}%` }}>{r.emoji}</span>
                                ))}
                            </div>
                            <div className="party-reactions-bar">
                                {PARTY_EMOJI.map(e => (
                                    <button key={e} className="party-reaction-btn" onClick={() => sendReaction(e)} aria-label={`React ${e}`}>{e}</button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                <div className="watch-options">
                    <button className="wbar-details-btn" onClick={() => navigate(`/detail/${id}`)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                        <span>Details</span>
                    </button>
                    <div className="wbar-info">
                        <p className="wbar-title">
                            {type === 'tv' ? (seriesData?.name || seriesData?.title || '') : (data?.title || data?.name || '')}
                        </p>
                        {type === 'tv' && (
                            <div className="wbar-ep-row">
                                <button
                                    className="wbar-ep-arrow"
                                    disabled={parseInt(episode) <= 1 && parseInt(season) <= 1}
                                    onClick={handlePrevEp}
                                >‹</button>
                                <span className="wbar-ep-label">
                                    S{season} · E{episode}
                                    {data?.name ? <span className="wbar-ep-name"> - {data.name}</span> : null}
                                </span>
                                <button
                                    className="wbar-ep-arrow"
                                    disabled={parseInt(episode) >= effectiveMaxEp && parseInt(season) >= effectiveMaxSe}
                                    onClick={handleNextEp}
                                >›</button>
                            </div>
                        )}
                    </div>
                    <div className="wbar-btns">
                        <button className={`wbar-btn${bookmarked === 1 ? ' on' : ''}`} onClick={Bookmark}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                {bookmarked === 1
                                    ? <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                                    : <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z"/>
                                }
                            </svg>
                            <span>Favourite</span>
                        </button>
                        <button className={`wbar-btn${myListed === 1 ? ' on' : ''}`} onClick={MyList}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                {myListed === 1
                                    ? <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                    : <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                }
                            </svg>
                            <span>My List</span>
                        </button>
                        <button className="wbar-btn" onClick={() => { reloadVideo(relData + 1); window.location.reload(); }}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4C7.58 4 4.01 7.57 4.01 12S7.58 20 12 20c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                            <span>Reload</span>
                        </button>
                        {type === 'tv' && (
                            <button
                                className={`wbar-btn${autoNext === 1 ? ' on' : ''}`}
                                onClick={() => { const n = autoNext === 1 ? 0 : 1; setAutoNext(n); localStorage.setItem('autoNext', String(n)); }}
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                    <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
                                </svg>
                                <span>Auto Next</span>
                            </button>
                        )}
                        {parseInt(provider) === 1 && castSupported && (
                            <button
                                className={`wbar-btn${castConnected ? ' on' : ''}`}
                                onClick={handleCast}
                                aria-label={castConnected ? 'Stop casting' : 'Cast to a nearby device'}
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                    <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                                </svg>
                                <span>{castConnected ? 'Casting' : 'Cast'}</span>
                            </button>
                        )}
                        {parseInt(provider) === 1 && lmUrl && (
                            <button className="wbar-btn" onClick={handleDownload} aria-label="Download this title">
                                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                                </svg>
                                <span>Download</span>
                            </button>
                        )}
                        <button
                            className={`wbar-btn${partyRoomId ? ' on' : ''}`}
                            onClick={() => setPartyModalOpen(true)}
                            aria-label={partyRoomId ? 'Watch party active' : 'Start or join a watch party'}
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                            </svg>
                            <span>{partyRoomId ? `Party ${partyRoomId}` : 'Party'}</span>
                        </button>
                        <button className="wbar-btn wbar-btn-server" onClick={() => {
                            const next = parseInt(provider) >= 3 ? 1 : parseInt(provider) + 1;
                            setProvider(next);
                            localStorage.setItem('provider' + vidID, next);
                        }}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zm-2 6c-.83 0-1.5-.67-1.5-1.5S17.17 16 18 16s1.5.67 1.5 1.5S18.83 19 18 19zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zm-2 6c-.83 0-1.5-.67-1.5-1.5S17.17 7 18 7s1.5.67 1.5 1.5S18.83 9 18 9z"/>
                            </svg>
                            <span>Server {provider}</span>
                        </button>
                        {parseInt(provider) === 1 && lmSubtitles.length > 0 && (
                            <div className="wbar-sub-offset">
                                <span className="wbar-sub-offset-label">Subtitle Offset</span>
                                <div className="wbar-sub-offset-controls">
                                    <button className="wbar-sub-offset-btn" onClick={() => setSubOffset(v => parseFloat((v - 0.5).toFixed(1)))}>−</button>
                                    <span className="wbar-sub-offset-val">{subOffset > 0 ? `+${subOffset}s` : `${subOffset}s`}</span>
                                    <button className="wbar-sub-offset-btn" onClick={() => setSubOffset(v => parseFloat((v + 0.5).toFixed(1)))}>+</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                </div>

            </div>
            {type === 'tv' && seriesData?.seasons && (
                <div className="weps">
                    <div className="weps-seasons">
                        {seriesData.seasons
                            .filter(s => s.season_number > 0)
                            .map(s => (
                                <button
                                    key={s.season_number}
                                    className={`weps-s-btn${panelSeason === s.season_number ? ' on' : ''}`}
                                    onClick={() => setPanelSeason(s.season_number)}
                                >
                                    S{s.season_number}
                                </button>
                            ))
                        }
                    </div>
                    <div className="weps-eps">
                        {(() => {
                            const seasonInfo = seriesData.seasons.find(s => s.season_number === panelSeason);
                            const count = seasonInfo?.episode_count || 0;
                            return Array.from({ length: count }, (_, i) => i + 1).map(epNum => (
                                <button
                                    key={epNum}
                                    className={`weps-e-btn${panelSeason === parseInt(season) && epNum === parseInt(episode) ? ' on' : ''}`}
                                    onClick={() => {
                                        setSeason(panelSeason);
                                        setEpisode(epNum);
                                        localStorage.setItem('season' + id, panelSeason);
                                        localStorage.setItem('episode' + id, epNum);
                                        pushPartyEpisodeNow(panelSeason, epNum);
                                    }}
                                >
                                    {epNum}
                                </button>
                            ));
                        })()}
                    </div>
                </div>
            )}
        </div>
            {providerToast && (
                <div className="provider-toast">{providerToast}</div>
            )}

            {partyRoomId && (
                <div className={`party-banner party-banner-${partyStatus}`}>
                    <span className="party-banner-dot" />
                    <span className="party-banner-label">
                        Watch Party · <strong>{partyRoomId}</strong>
                        <span className="party-banner-status">
                            {partyStatus === 'connected' ? 'live' : partyStatus === 'connecting' ? 'connecting…' : 'disconnected'}
                        </span>
                    </span>
                    {partyParticipants.length > 0 && (
                        <span className="party-banner-presence" title={partyParticipants.join(', ')}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                            {partyParticipants.length}
                        </span>
                    )}
                    <button className="party-banner-btn" onClick={() => setPartyChatOpen(o => !o)}>
                        Chat{partyUnread > 0 ? ` (${partyUnread})` : ''}
                    </button>
                    <button className="party-banner-btn" onClick={copyPartyLink}>
                        {partyLinkCopied ? 'Copied!' : 'Copy link'}
                    </button>
                    <button className="party-banner-btn party-banner-leave" onClick={leaveWatchParty}>Leave</button>
                </div>
            )}

            {partyRoomId && partyChatOpen && (
                <div className="party-chat">
                    <div className="party-chat-header">
                        <span className="party-chat-title">
                            Party Chat
                            {partyParticipants.length > 0 && <span className="party-chat-count"> · {partyParticipants.length} here</span>}
                        </span>
                        <button className="party-chat-close" onClick={() => setPartyChatOpen(false)} aria-label="Close chat">✕</button>
                    </div>
                    {partyParticipants.length > 0 && (
                        <div className="party-chat-presence">
                            {partyParticipants.map(p => (
                                <span key={p} className="party-chat-chip">
                                    <span className="party-chat-chip-dot" />{p}
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="party-chat-messages">
                        {partyChat.length === 0 ? (
                            <p className="party-chat-empty">No messages yet — say hi 👋</p>
                        ) : partyChat.map(m => {
                            const mine = m.user === (localStorage.getItem('user'));
                            return (
                                <div key={m.id} className={`party-chat-msg${mine ? ' mine' : ''}`}>
                                    {!mine && <span className="party-chat-user">{m.user}</span>}
                                    <span className="party-chat-text">{m.text}</span>
                                </div>
                            );
                        })}
                        <div ref={partyChatEndRef} />
                    </div>
                    <div className="party-chat-input-row">
                        <input
                            className="party-chat-input"
                            placeholder="Message…"
                            value={partyChatInput}
                            maxLength={500}
                            onChange={(e) => setPartyChatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') sendPartyChat(); }}
                        />
                        <button className="party-chat-send" onClick={sendPartyChat} disabled={!partyChatInput.trim()}>Send</button>
                    </div>
                </div>
            )}

            {partyModalOpen && (
                <div className="party-modal-overlay" onClick={() => setPartyModalOpen(false)}>
                    <div className="party-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="party-modal-close" onClick={() => setPartyModalOpen(false)}>✕</button>
                        <h2 className="party-modal-title">Watch Party</h2>
                        {partyRoomId ? (
                            <>
                                <p className="party-modal-sub">You're in room <strong>{partyRoomId}</strong>. Share this link:</p>
                                <div className="party-modal-link">
                                    <code>{`${window.location.origin}/watch/${id}?party=${partyRoomId}`}</code>
                                    <button className="party-modal-copy" onClick={copyPartyLink}>
                                        {partyLinkCopied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <p className="party-modal-hint">Anyone with the link auto-joins. Play, pause, and seeks sync across all viewers. Episode changes propagate too.</p>
                                <button className="party-modal-action party-modal-action-danger" onClick={leaveWatchParty}>Leave party</button>
                            </>
                        ) : (
                            <>
                                <p className="party-modal-sub">Watch with friends — playback stays in sync.</p>
                                <button className="party-modal-action" onClick={startWatchParty}>Create party for this title</button>
                                <div className="party-modal-divider"><span>or join</span></div>
                                <div className="party-modal-join">
                                    <input
                                        className="party-modal-input"
                                        placeholder="Room code (6 letters/digits)"
                                        value={partyJoinInput}
                                        onChange={(e) => setPartyJoinInput(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') joinWatchParty(); }}
                                        maxLength={6}
                                    />
                                    <button className="party-modal-action party-modal-action-secondary" onClick={joinWatchParty}>Join</button>
                                </div>
                                {partyJoinError && <p className="party-modal-error">{partyJoinError}</p>}
                            </>
                        )}
                    </div>
                </div>
            )}
            {partyDebugEnabled && (
                <div style={{
                    position: 'fixed',
                    left: 8,
                    top: 8,
                    width: 380,
                    maxHeight: '60vh',
                    overflow: 'auto',
                    zIndex: 99998,
                    background: 'rgba(0,0,0,0.86)',
                    color: '#80c0ff',
                    border: '1px solid rgba(63,163,255,0.45)',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 11,
                    lineHeight: 1.35,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        party debug · room={partyRoomId || '-'} · status={partyStatus} · clientId={partyClientIdRef.current.slice(0, 8)}…
                    </div>
                    {partyDebugLog.length === 0
                        ? <div style={{ color: '#888' }}>(no events yet)</div>
                        : partyDebugLog.join('\n')}
                </div>
            )}
            {creditsDebugEnabled && (
                <div style={{
                    position: 'fixed',
                    right: 8,
                    top: 8,
                    width: 260,
                    zIndex: 99998,
                    background: 'rgba(0,0,0,0.86)',
                    color: '#ffd27f',
                    border: '1px solid rgba(255,210,127,0.45)',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontFamily: 'monospace',
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>credits detector</div>
                    {!creditsDebug ? (
                        <div style={{ color: '#888' }}>(waiting for player…)</div>
                    ) : creditsDebug.tainted ? (
                        <div style={{ color: '#ff8a8a' }}>canvas TAINTED — pixel detection unavailable (CORS). Timestamp trigger only.</div>
                    ) : (
                        <>
                            <div>pct: {creditsDebug.pct} {creditsDebug.pct >= 0.8 ? '(armed)' : '(waiting ≥0.80)'}</div>
                            <div>brightness: {creditsDebug.mean} {creditsDebug.mean != null && creditsDebug.mean < 60 ? '← dark' : ''}</div>
                            <div>motion: {creditsDebug.motion} {creditsDebug.motion != null && creditsDebug.motion < 3.5 ? '← static' : ''}</div>
                            <div>score: {creditsDebug.score} / 5</div>
                            <div>hasNext: {String(creditsDebug.hasNext)}</div>
                        </>
                    )}
                </div>
            )}
            {subTraceEnabled && subtitleDebugOverlay.length > 0 && (
                <div style={{
                    position: 'fixed',
                    left: 8,
                    right: 8,
                    bottom: 8,
                    zIndex: 99999,
                    maxHeight: '34vh',
                    overflow: 'auto',
                    background: 'rgba(0,0,0,0.86)',
                    color: '#8fffa0',
                    border: '1px solid rgba(143,255,160,0.45)',
                    borderRadius: 8,
                    padding: 8,
                    fontSize: 11,
                    lineHeight: 1.35,
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}>
                    {subtitleDebugOverlay.join('\n')}
                </div>
            )}
        </>
    );
  }

  // <iframe id="player_iframe" src="https://gbf7wrqapjg1js045ye8.com/prorcp/NjFkNzc0YTU0YTBhZDI5OGZjYWQzYWYyNmNjNjk2MDc6Y1RGNVFuaFNia3BUUnpWa2RDdHpZMHQwVTJwaVNWUkNPVk41YlVKcVdGQnFiVTAyZDBGdVRGWnpSbXB5ZFVsMk4weFBZVWc0T0ZkeGNHMTBjMnM1WkhKV1JYZGFNVk5PVlU4MWJGWjVXbk52Y204eGVYUTNjbGR1TlUxYWRVMXBOMmRvTUd4RlpWUllkbkpVU2tGVlRFWkRNV2xuZFhWaE0xQkRWRTV6V21WMUt6bHhlR1UwWlU0M1owSk5aWHBPVURSbWNERlFWMkU1Y21sWU9WbExaVEJKVEd0SVJuWTFZaTl0TWxORmNrMW1RbEUzTjJkMVlsSkRhekZ1Um1sRlNXOW1XalJZZDJkbFdYcDNVWEpCWm1OaWVtUm9hR1o2Y25oMFN6TXlNbkV3Ukd0bFdVcFlVRFZzYUdSdlJWRXdNMjV2UlhCWmMwcE9XV1l5WnpKUVRWQnVibkpxS3pRMFNXUmthV3h1YkRSWFVXWkdiRFl5T1Rjd2RWWkVTbFpwZGxGNFRsTnVSakZLTDBWRVZuUTBLMU5EUmxsRGJEWkxlSEJTTDFsYU1XSmxTM2REVnpsR1lXaHpNRFpOV2paRWJVb3ZablpPV2k4NVZXeERNa1EzTURCS2FHSkVhV3Q0YTFvM1VtbHNSRzQwVFRNMWVqZFlSV3hxU21Kak4weFdWRXBxWjBkeGJqYzRWR05zVFRGdVFVeHRiRXR0WldadFRGVjFhek5LWmtkbVREaEphazVrUWpVMFJrbGlRMFpqYUd3dlQyNVljRUZuUld0SWFYZFhhbTFJTDBsQlZsSlhTVEJNT0dkQ2VYQm1jbVE0VkN0blIwdFljRGRGVkVZck1WVlliR2h2VXpkNk4zVkNMM0pCTDFBMGJFdzJlbWxZVm0xV1QxbEdibXBGWjNWTFJVbEpVR2hKWkZoVVpVdEpWa2wxVlhKTmNXdDRZMEpUYnpoQ2NIaEhNa2xvVkhad1VrdE9jRVpSZGxWUk1scFlUMmd4Y1hkaFRFOU1NV3hZZUU5ak9YaE9jRWhMYldSaFYzUkdkVFpuWkdWRWIyVnVPV0pNY0RWSE1FWmlaMmhDYVdoUlZFSjNjR1kzTjFaMGNXWkpWMGhIUVVFcmJuSmFjaXRvVlU5SFVtdzFjVkpWWTNob1RqQlBkV3BIWW1nM1FVaDJOMjVMYWsweWVXWmlTV2g1UkRKUVZ6UnNXRzVTVkVaQ09XcExjRUpsZDFJdmJVNUZXWEJZVG5sdVIyZHFheTlFU3paU09YRm1ZM0pRWmpoNVEwOUdjM2MwYlRkUE4wSmlaakl3VEc1T1JVSktkV1ZzTlVRMlNrZDVhRGxGYUhCd2FrRndiMEZ2YlVoTVlrVXZXbkZ1VUhWYVNEZFNiVXh4WW1oMFlWaFJibk42UVhsTGNsZEZkV3hsV0daWmVEaERiR1Z2TVhsSWNYVkZPR3B0WmpoT2NtRnBiWHBxYWs1bk5GWTNXRmM1ZDFscGJHOWxTbWx3WTBGUmRXRXZPR2xGYVhaNksxUnhWWGxzUld4eFFuUkpRbVpYVkdzdlJIVnNiMmRWWTFod2VVZFpjMjFoVEhadGMybEdiblZxV2xKVU1XTk5kR1pqY0Uxa2ExaHlPRlF2VlZoc2VWVTVUV05uUjJ3NUsxUjFTamwxYjFVdmR6UjFkbWxNZWt3elVWaFVlalZqWjNCcVNqTm1ZbWhJWVU1T1VYRTFOM1p1WkVVNVRtZG9RbFV5YVc1R2VUUTFMMFppVEVrMVQzSkpXR1JDYTFwSWJXaFZNV1ZFUld4WU5UTXdhMFppWkVOR2FWaGlLM1IwVm5oNGNUQmFkaXQyYUU5cWF6TkRZVnBKZFc1MlQxZFJabWRXUjBjeUsyRlRTMlZPSzNacmFWQmhNVlV2VUhsSFl6ZFRabGhZUkc4M2FFZG1ibXBxTnpsQlptbHhXR3BtSzI5bVVVdFRURWwwVDNvckwzVXJkRVowVDNaV1FWcHVaRTVFYVVKc1pXRjZORTB6UzJ3MFIwSnVTbE5FWmpsYU9Dc3JLMlJ6WTFSVmJFVlBTRnB0YTBKUGFIQkpkVkI0WWxSSldFUlVOSEJLU1UxTk5GSjVZVVp2VFhWWmVXRjBjVzlxVnpadGR6SjRLMEpxYjBGQ09IWnVaRzhyV2s5UE1tcFRZMjlLWVd4S2Rrb3ZhREJDVUdvclVUZ3lPRk16ZFRrcmJtYzBZMmhQVkhSV2FXcFpPV1phTXpOMGNqQmtUMVp0ZFRsWWRFcFRaaTluTVZkVlMxZHdLMlJNWVhGU1RqVmxhVVF2ZGxwVWJuVjNabEppU1ZvMFZUUk1lWFZFWm1WRllXOW5kVUZQY0dwcGRYTlRXbGhTVDJ0d1MwcERWbXhtTTFWclVGTjBUa056WTNFeGNuSnpkbm92UjNaS2FtZHlaejA5" frameborder="0" scrolling="no" allowfullscreen="yes" allow="autoplay"></iframe>
