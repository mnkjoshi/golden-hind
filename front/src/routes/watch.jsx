import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState, useRef } from 'react';
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
    const lmContainerRef = useRef(null);
    const hlsRef = useRef(null);
    const plyrRef = useRef(null);
    const flashTimeoutRef = useRef(null);

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

    const[bookmarked, setBookmark] = useState(-1);

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
    const playbackStateRef = useRef({});
    const savePositionTimerRef = useRef(null);

    let location = useLocation();
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

    // Disable body overflow when watch page is active + log watch time on unmount
    useEffect(() => {
        track('watch', { id, type: id.slice(0, 1) === 'm' ? 'movie' : 'tv' })
        document.body.classList.add('watch-page');
        document.documentElement.classList.add('watch-page');

        return () => {
            document.body.classList.remove('watch-page');
            document.documentElement.classList.remove('watch-page');
            const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
            const watchUser = localStorage.getItem('user');
            const watchToken = localStorage.getItem('token');
            if (watchUser && watchToken && duration >= 10) {
                fetch('https://goldenhind.tech/watch-time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                    body: JSON.stringify({
                        user: watchUser,
                        token: watchToken,
                        contentId: id,
                        contentName: contentNameRef.current || 'Unknown',
                        duration
                    })
                }).catch(() => {});
            }
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

    // Keep contentNameRef in sync so the unmount closure always has the latest title
    useEffect(() => {
        if (data && (data.name || data.title)) {
            contentNameRef.current = data.name || data.title;
        }
    }, [data]);

    // Fetch LookMovie stream when provider 4 is selected or episode changes.
    // progressReady is false for TV shows until progress_retrieve returns so we
    // don't fire with the default season=1/episode=1 before saved progress loads.
    useEffect(() => {
        if (parseInt(provider) !== 1) return;
        if (!progressReady) return;
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
                const subParams = new URLSearchParams(location.search);
                const subDebug = subParams.has('subdebug');
                const subHello = subParams.has('subhello');
                const subNative = subParams.has('subnative');
                const subTrace = subParams.has('subtrace');
                if (subNative) {
                    const nextUrl = `https://goldenhind.tech/debug/native-subtitles.m3u8?url=${encodeURIComponent(r.data.url)}${subTrace ? '&trace=1' : ''}`;
                    addSubtitleDebugLine(`subnative url=${nextUrl.slice(0, 180)}`);
                    setLmUrl(nextUrl);
                } else if (!Hls.isSupported() && subs.length > 0) {
                    const nextUrl = `https://goldenhind.tech/proxy/hls-with-subs?url=${encodeURIComponent(r.data.url)}&subs=${encodeURIComponent(JSON.stringify(subs))}${subDebug ? '&debug=1' : ''}${subHello ? '&hello=1' : ''}${subTrace ? '&trace=1' : ''}`;
                    addSubtitleDebugLine(`native subs url=${nextUrl.slice(0, 180)}`);
                    setLmUrl(nextUrl);
                } else {
                    const nextUrl = `https://goldenhind.tech/proxy/hls?url=${encodeURIComponent(r.data.url)}`;
                    addSubtitleDebugLine(`plain hls url=${nextUrl.slice(0, 180)}`);
                    setLmUrl(nextUrl);
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

    // Attach HLS.js + Plyr when a stream URL arrives.
    // We manage the <video> element entirely imperatively inside lmContainerRef so
    // React never tries to reconcile Plyr's restructured DOM (which causes the
    // removeChild NotFoundError when the episode changes and React re-renders).
    useEffect(() => {
        if (!lmUrl || !lmContainerRef.current) return;
        const subtitleTraceCleanup = [];
        const forceNativeHls = new URLSearchParams(location.search).has('subnative');

        // Tear down any existing instances first
        if (plyrRef.current) { plyrRef.current.destroy(); plyrRef.current = null; }
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        const container = lmContainerRef.current;
        container.innerHTML = ''; // wipe previous Plyr wrapper completely

        // Create a fresh <video> element — React never touches this node
        const video = document.createElement('video');
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.width = '100%';
        video.style.height = '100%';
        container.appendChild(video);
        videoRef.current = video;

        if (subTraceEnabled) {
            const tracedTracks = new WeakSet();
            sendSubtitleTrace('video-created', {
                lmUrl,
                hlsSupported: Hls.isSupported(),
                canPlayNativeHls: video.canPlayType('application/vnd.apple.mpegurl'),
                userAgent: navigator.userAgent,
            }, video);

            let lastSnapshot = 0;
            const videoEvents = [
                'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'play', 'pause',
                'seeking', 'seeked', 'ratechange', 'durationchange', 'error',
                'webkitbeginfullscreen', 'webkitendfullscreen', 'webkitpresentationmodechanged',
            ];
            const traceVideoEvent = (event) => sendSubtitleTrace(`video-${event.type}`, {
                readyState: video.readyState,
                networkState: video.networkState,
                paused: video.paused,
                error: video.error ? { code: video.error.code, message: video.error.message } : null,
            }, video);

            videoEvents.forEach(eventName => {
                video.addEventListener(eventName, traceVideoEvent);
                subtitleTraceCleanup.push(() => video.removeEventListener(eventName, traceVideoEvent));
            });

            const traceTimeupdate = () => {
                if (Math.abs(video.currentTime - lastSnapshot) < 5) return;
                lastSnapshot = video.currentTime;
                sendSubtitleTrace('video-timeupdate', {
                    readyState: video.readyState,
                    networkState: video.networkState,
                    paused: video.paused,
                }, video);
            };
            video.addEventListener('timeupdate', traceTimeupdate);
            subtitleTraceCleanup.push(() => video.removeEventListener('timeupdate', traceTimeupdate));

            const attachTrackTrace = () => {
                Array.from(video.textTracks || []).forEach((track, index) => {
                    if (tracedTracks.has(track)) return;
                    tracedTracks.add(track);
                    const onCueChange = () => sendSubtitleTrace('texttrack-cuechange', {
                        index,
                        label: track.label,
                        language: track.language,
                        mode: track.mode,
                    }, video);
                    track.addEventListener('cuechange', onCueChange);
                    subtitleTraceCleanup.push(() => track.removeEventListener('cuechange', onCueChange));
                });
                sendSubtitleTrace('texttrack-snapshot', {}, video);
            };

            const traceInterval = setInterval(attachTrackTrace, 5000);
            subtitleTraceCleanup.push(() => clearInterval(traceInterval));
            setTimeout(attachTrackTrace, 0);
        }

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
        if (Hls.isSupported() && !forceNativeHls) {
            uniqueSubs.forEach(sub => {
                const rawSub = String(sub.file || sub.url || '');
                if (!rawSub.startsWith('/') && !rawSub.startsWith('http')) return;
                const absSubUrl = rawSub.startsWith('http') ? rawSub : `https://www.lookmovie2.to${rawSub}`;
                const trackEl = document.createElement('track');
                trackEl.kind = 'subtitles';
                trackEl.label = sub.language || sub.lang || `Track ${trackIndex + 1}`;
                trackEl.srclang = subtitleLangCode(sub, trackIndex);
                trackEl.src = `https://goldenhind.tech/proxy/subtitle.vtt?url=${encodeURIComponent(absSubUrl)}`;
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
            const savedPos = parseFloat(localStorage.getItem(posKey) || '0');

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

            // Restore playback position (skip if < 5s to avoid replaying a fresh start)
            if (savedPos > 5) {
                video.addEventListener('canplay', () => { video.currentTime = savedPos; }, { once: true });
            }

            // Save position every 5 seconds while playing; show up-next popup at 95%
            let lastSaved = 0;
            let upNextShown = false;
            player.on('timeupdate', () => {
                const now = Date.now();
                if (now - lastSaved > 5000 && player.currentTime > 5) {
                    lastSaved = now;
                    localStorage.setItem(posKey, player.currentTime);
                }
                const { autoNext: an, episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
                if (an === 1 && !upNextShown && player.duration > 0 && player.currentTime / player.duration >= 0.95) {
                    const hasNext = parseInt(ep) < parseInt(mEp) || parseInt(se) < parseInt(mSe);
                    if (hasNext) {
                        upNextShown = true;
                        const nextEp = parseInt(ep) < parseInt(mEp) ? parseInt(ep) + 1 : 1;
                        const nextSe = parseInt(ep) < parseInt(mEp) ? parseInt(se) : parseInt(se) + 1;
                        triggerUpNext(nextEp, nextSe);
                    }
                }
            });

            // Persist volume and speed preferences across sessions
            player.on('volumechange', () => localStorage.setItem('playerVolume', player.volume));
            player.on('ratechange', () => localStorage.setItem('playerSpeed', player.speed));

            // Auto-next for provider 4 — execute immediately on end (popup already showing from 95%)
            player.on('ended', () => {
                localStorage.removeItem(posKey);
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

        if (Hls.isSupported() && !forceNativeHls) {
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
            if (plyrRef.current) { plyrRef.current.destroy(); plyrRef.current = null; }
            if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
            subtitleTraceCleanup.forEach(cleanup => cleanup());
            container.innerHTML = '';
            videoRef.current = null;
        };
    }, [lmUrl]);

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



    const handlePrevEp = () => {
        if (parseInt(episode) > 1) {
            const prev = parseInt(episode) - 1;
            localStorage.setItem('episode' + id, prev);
            setEpisode(prev);
        } else if (parseInt(season) > 1) {
            const prevSe = parseInt(season) - 1;
            const prevSeasonInfo = seriesData?.seasons?.find(s => s.season_number === prevSe);
            if (prevSeasonInfo?.episode_count) {
                const lastEp = prevSeasonInfo.episode_count;
                localStorage.setItem('season' + id, prevSe);
                localStorage.setItem('episode' + id, lastEp);
                setSeason(prevSe);
                setEpisode(lastEp);
            } else {
                const u = localStorage.getItem('user'), t = localStorage.getItem('token');
                axios.post('https://goldenhind.tech/season', { user: u, token: t, seriesId: vidID, seasonNumber: prevSe })
                    .then(res => {
                        const lastEp = res.data?.episodes?.length || 1;
                        localStorage.setItem('season' + id, prevSe);
                        localStorage.setItem('episode' + id, lastEp);
                        setSeason(prevSe);
                        setEpisode(lastEp);
                    })
                    .catch(() => {
                        localStorage.setItem('season' + id, prevSe);
                        localStorage.setItem('episode' + id, 1);
                        setSeason(prevSe);
                        setEpisode(1);
                    });
            }
        }
    };

    const handleNextEp = () => {
        if (parseInt(episode) < parseInt(maxEp)) {
            const next = parseInt(episode) + 1;
            localStorage.setItem('episode' + id, next);
            setEpisode(next);
        } else if (parseInt(season) < parseInt(maxSe)) {
            const nextSe = parseInt(season) + 1;
            localStorage.setItem('season' + id, nextSe);
            localStorage.setItem('episode' + id, 1);
            setSeason(nextSe);
            setEpisode(1);
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
    };

    return (
        <>
        <div className= "watch-main" id= "watch-main">
            {!(seriesData == null) ? (!(seriesData.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + seriesData.backdrop_path}/>  : null): null}
            {!(data == null) ? (!(data.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + data.backdrop_path}/>  : null): null}
            <Topbar/>
            <div className= "watch-holder" id= "watch-holder">
                <div className= "watch-system">
                <div className= "watch-player">
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
                            <div className="lm-skip-overlay">
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
                            <span>Watchlist</span>
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
