import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from 'axios'
import React, { useEffect, useState, useRef } from 'react';
import Hls from 'hls.js';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { track } from '../utils/analytics.js'
import Topbar from "../components/topbar"

import BookmarkIcon from "../assets/bookmark.png"
import ReloadIcon from "../assets/reload.png"
import StarIcon from "../assets/star.png"
import AutonextIcon from "../assets/autonext.png"

export default function App() {
    // useParams must come first — id is needed to initialize progressReady
    const { id } = useParams();
    let type = id.slice(0, 1)
    let vidID = id.slice(1, 100000)

    const [season, setSeason] = useState(1);
    const [episode, setEpisode] = useState(1);

    const [first, setFirst] = useState(0);

    const [relData, reloadVideo] = useState(1);

    const [maxEp, setMaxEp] = useState(1);
    const [maxSe, setMaxSe] = useState(1);

    const [autoNext, setAutoNext] = useState(0);
    const [autoPlay, setAutoPlay] = useState(0);

    const [provider, setProvider] = useState(4);

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
    const upNextTimerRef = useRef(null);
    const upNextInfoRef = useRef(null);

    const [providerToast, setProviderToast] = useState(null);
    const providerToastTimerRef = useRef(null);

    const[bookmarked, setBookmark] = useState(-1);
    const [reviews, setReviews] = useState([]);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewHover, setReviewHover] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const [reviewSubmitting, setReviewSubmitting] = useState(false);

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

    // Fetch reviews for this content
    useEffect(() => {
        axios.get(`https://goldenhind.tech/reviews?contentId=${id}`)
            .then(r => setReviews(r.data.reviews || []))
            .catch(() => {});
    }, [id]);

    const submitReview = () => {
        if (!reviewRating || reviewSubmitting) return;
        setReviewSubmitting(true);
        axios.post('https://goldenhind.tech/review', {
            user, token, contentId: id, rating: reviewRating, text: reviewText
        }).then(r => {
            if (r.data.success) {
                setReviews(prev => {
                    const filtered = prev.filter(rv => rv.username !== user);
                    return [{ username: user, rating: reviewRating, text: reviewText, timestamp: Date.now() }, ...filtered];
                });
                setReviewText('');
                setReviewRating(0);
            }
        }).catch(() => {}).finally(() => setReviewSubmitting(false));
    };

    // Fetch LookMovie stream when provider 4 is selected or episode changes.
    // progressReady is false for TV shows until progress_retrieve returns so we
    // don't fire with the default season=1/episode=1 before saved progress loads.
    useEffect(() => {
        if (parseInt(provider) !== 4) return;
        if (!progressReady) return;
        setLmUrl(null);
        setLmError(null);
        setLmLoading(true);
        axios({
            method: 'post',
            url: 'https://goldenhind.tech/server/lookmovie',
            data: { user, token, id, season, episode }
        }).then(r => {
            if (r.data.dbg) console.group('[LookMovie Debug]'), r.data.dbg.forEach(l => console.log(l)), console.groupEnd();
            if (r.data.success) {
                setLmSubtitles(r.data.subtitles || []);
                setLmUrl(`https://goldenhind.tech/proxy/hls?url=${encodeURIComponent(r.data.url)}`);
            } else {
                setProvider(1);
                localStorage.setItem("provider" + vidID, 1);
                showProviderToast('LookMovie unavailable — switched to Server 1');
            }
        }).catch(() => {
            setProvider(1);
            localStorage.setItem("provider" + vidID, 1);
            showProviderToast('LookMovie unavailable — switched to Server 1');
        }).finally(() => setLmLoading(false));
    }, [provider, season, episode, progressReady]);

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

        // Create a fresh <video> element — React never touches this node
        const video = document.createElement('video');
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.width = '100%';
        video.style.height = '100%';
        container.appendChild(video);
        videoRef.current = video;

        // Inject subtitle tracks.
        // Each track gets a unique srclang (sub0, sub1…) so Plyr can distinguish
        // between multiple tracks of the same language in its settings menu.
        const uniqueSubs = lmSubtitles;
        let trackIndex = 0;
        uniqueSubs.forEach(sub => {
            const rawSub = String(sub.file || sub.url || '');
            if (!rawSub.startsWith('/') && !rawSub.startsWith('http')) return;
            const absSubUrl = rawSub.startsWith('http') ? rawSub : `https://www.lookmovie2.to${rawSub}`;
            const trackEl = document.createElement('track');
            trackEl.kind = 'subtitles';
            trackEl.label = sub.language || sub.lang || `Track ${trackIndex + 1}`;
            trackEl.srclang = `sub${trackIndex}`;
            trackEl.src = `https://goldenhind.tech/proxy/subtitle?url=${encodeURIComponent(absSubUrl)}`;
            if (trackIndex === 0) trackEl.default = true;
            // Apply any existing subtitle offset once cues have loaded
            trackEl.addEventListener('load', () => {
                const offset = subOffsetRef.current;
                if (offset !== 0 && trackEl.track?.cues) {
                    Array.from(trackEl.track.cues).forEach(cue => {
                        cue.startTime = Math.max(0, cue.startTime + offset);
                        cue.endTime = Math.max(0, cue.endTime + offset);
                    });
                }
            });
            video.appendChild(trackEl);
            trackIndex++;
        });

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

            // Save position every 5 seconds while playing
            let lastSaved = 0;
            player.on('timeupdate', () => {
                const now = Date.now();
                if (now - lastSaved > 5000 && player.currentTime > 5) {
                    lastSaved = now;
                    localStorage.setItem(posKey, player.currentTime);
                }
            });

            // Persist volume and speed preferences across sessions
            player.on('volumechange', () => localStorage.setItem('playerVolume', player.volume));
            player.on('ratechange', () => localStorage.setItem('playerSpeed', player.speed));

            // Auto-next for provider 4 — show countdown overlay, advance when it reaches 0
            player.on('ended', () => {
                localStorage.removeItem(posKey);
                const { autoNext: an, episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
                if (an !== 1) return;
                if (ep == mEp) {
                    if (se < mSe) triggerUpNext(1, parseInt(se) + 1);
                } else {
                    triggerUpNext(parseInt(ep) + 1, parseInt(se));
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
            if (plyrRef.current) { plyrRef.current.destroy(); plyrRef.current = null; }
            if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
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
        clearInterval(upNextTimerRef.current);
        upNextTimerRef.current = null;
    };

    const showProviderToast = (msg) => {
        clearTimeout(providerToastTimerRef.current);
        setProviderToast(msg);
        providerToastTimerRef.current = setTimeout(() => setProviderToast(null), 4000);
    };

    useEffect(() => {
        if (!upNextInfo) return;
        clearInterval(upNextTimerRef.current);
        upNextTimerRef.current = setInterval(() => {
            setUpNextSeconds(s => {
                if (s <= 1) {
                    clearInterval(upNextTimerRef.current);
                    upNextTimerRef.current = null;
                    const info = upNextInfoRef.current;
                    if (info) {
                        upNextInfoRef.current = null;
                        setUpNextInfo(null);
                        localStorage.setItem('episode' + id, info.targetEpisode);
                        localStorage.setItem('season' + id, info.targetSeason);
                        setEpisode(info.targetEpisode);
                        setSeason(info.targetSeason);
                        setAutoPlay(1);
                    }
                    return 5;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(upNextTimerRef.current);
    }, [upNextInfo]);

    // Keyboard shortcuts for provider 4
    useEffect(() => {
        if (parseInt(provider) !== 4) return;
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

    // Auto-next for iframe providers (1–3) — single persistent listener, reads live state via ref
    useEffect(() => {
        const handler = (event) => {
            if (event.data?.data?.event !== 'ended') return;
            const { autoNext: an, episode: ep, season: se, maxEp: mEp, maxSe: mSe } = playbackStateRef.current;
            if (an !== 1) return;
            if (ep == mEp) {
                if (se < mSe) triggerUpNext(1, parseInt(se) + 1);
            } else {
                triggerUpNext(parseInt(ep) + 1, parseInt(se));
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Keep panelSeason in sync when the user navigates via arrow buttons
    useEffect(() => {
        setPanelSeason(parseInt(season));
    }, [season]);

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
        if (provider == 1) {
            if (type == 'movie') {
                video = `https://vidlink.pro/${type}/${vidID}/?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=false&poster=true`
            } else {
                video = `https://vidlink.pro/${type}/${vidID}/${season}/${episode}?primaryColor=3FA3FF&secondaryColor=6db8ff&autoplay=${autoPlay == 1 ? "true" : "false"}&poster=true${autoPlay == 1 ? "&startAt=0" : ""}`
            }
        } else if (provider == 2) {
            if (type == 'movie') {
                video = `https://vidsrc.me/embed/${type}?tmdb=${vidID}`
            } else {
                video = `https://vidsrc.me/embed/${type}?tmdb=${vidID}&season=${season}&episode=${episode}&autoplay=${autoPlay}`
            }
        } else if(provider == 3) {
            if (type == 'movie') {
                video = `https://vidsrc.icu/embed/${type}/${vidID}`
            } else {
                video = `https://vidsrc.icu/embed/${type}/${vidID}/${season}/${episode}`
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
            if (saved >= 1 && saved <= 4) {
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
                    setSeriesData(ToData)
                    let result = response.data
                    result.name == null ? (result.title == null ? document.title = "The Golden Hind" : document.title = result.title) : document.title = result.name  
                    const currentSeason = ToData.seasons.find(s => s.season_number === season);
                    if (currentSeason) {
                        setMaxSe(ToData.seasons.length);
                        setMaxEp(currentSeason.episode_count);
                    } else {
                        setMaxSe(response.data.seasons.length)
                        setMaxEp(response.data.seasons[season - 1].episode_count)
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
                        localStorage.setItem("episode" + id, response.data.episode)
                        localStorage.setItem("season" + id, response.data.season)
                        setEpisode(response.data.episode)
                        setSeason(response.data.season)
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

    return (
        <>
        <div className= "watch-main" id= "watch-main">
            {!(seriesData == null) ? (!(seriesData.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + seriesData.backdrop_path}/>  : null): null}
            {!(data == null) ? (!(data.backdrop_path == null) ? <img className= "watch-backdrop" src = {"https://image.tmdb.org/t/p/original/" + data.backdrop_path}/>  : null): null}
            <Topbar/>
            <div className= "watch-holder" id= "watch-holder">
                <div className= "watch-system">
                <div className= "watch-player">
                    {parseInt(provider) === 4 ? (
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
                                    <span className="up-next-text">Next episode in {upNextSeconds}s</span>
                                    <button className="up-next-cancel" onClick={cancelUpNext}>Cancel</button>
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
                <div className= "watch-options">
                    <div className= "watch-left">
                        
                        {type == "movie" ? <MovieDisplay data= {data}/> : <EpisodeDisplay data = {data} season = {season} episode = {episode} setSeason = {setSeason} setEpisode = {setEpisode} maxEp= {maxEp} maxSe= {maxSe} id= {id}/>}

                        <div className= "watch-toggles1">
                            {localStorage.getItem("bookmarks").indexOf(id) == -1 ? 
                            <button className = "watch-toggles-button" onClick={() => Bookmark()}>
                                <img className = "watch-toggles-button-icon" src = {BookmarkIcon}/>
                            </button>
                            :
                            <button className = "watch-toggles-button-selected" onClick={() => Bookmark()}>
                                <img className = "watch-toggles-button-icon" src = {BookmarkIcon}/>
                            </button>
                            }
                            <button className = "watch-toggles-button watch-toggles-reload" onClick={() => {reloadVideo(relData + 1); console.log(relData); window.location.reload()}}>
                                <img className = "watch-toggles-button-icon watch-toggles-reload-icon" src = {ReloadIcon}/>
                            </button>

                           {autoNext == 1 ?
                            <button className = "watch-toggles-button-selected watch-toggles-next" onClick={() => {setAutoNext(0); localStorage.setItem("autoNext", "0")}}>
                                <img className = "watch-toggles-button-icon watch-toggles-next-icon" src = {AutonextIcon}/>
                            </button>
                            :
                             <button className = "watch-toggles-button watch-toggles-next" onClick={() => {setAutoNext(1); localStorage.setItem("autoNext", "1")}}>
                                <img className = "watch-toggles-button-icon watch-toggles-next-icon" src = {AutonextIcon}/>
                            </button>
                            }
                        </div>
                    </div>
                    <div className= "watch-right">
                        <div className= "watch-rating">
                            <div className= "watch-rating-info">
                                <p className= "watch-rating-score">
                                    {voteAvg}
                                </p>
                                <div className= "watch-rating-stars">
                                    {voteAvg >= 2 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 1.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 4 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 3.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 6 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 5.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 8 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg > 7.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                    {voteAvg >= 9.5 ? <img className= "watch-star-icon watch-star-full" src= {StarIcon}/> : (voteAvg >= 8.5 ? <img className= "watch-star-icon watch-star-half" src= {StarIcon}/> : <img className= "watch-star-icon watch-star-empty" src= {StarIcon}/>)}
                                </div>
                            </div>
                            {/* <div className= "watch-rating-underline"/> */}
                        </div>
                        <div className= "watch-toggles2">
                            <button className="watch-toggles-button watch-toggles-server" onClick={() => {
                                const next = parseInt(provider) >= 4 ? 1 : parseInt(provider) + 1;
                                setProvider(next);
                                localStorage.setItem("provider" + vidID, next);
                            }}>
                                <span className="watch-server-num">{provider}</span>
                                <span className="watch-server-label">SERVER</span>
                            </button>
                            {parseInt(provider) === 4 && lmSubtitles.length > 0 && (
                                <div className="watch-sub-offset">
                                    <button className="watch-sub-offset-btn" onClick={() => setSubOffset(v => parseFloat((v - 0.5).toFixed(1)))}>−</button>
                                    <span className="watch-sub-offset-val">{subOffset > 0 ? `+${subOffset}s` : `${subOffset}s`}</span>
                                    <button className="watch-sub-offset-btn" onClick={() => setSubOffset(v => parseFloat((v + 0.5).toFixed(1)))}>+</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                </div>

            </div>
            {/* ── Season / episode selector — right below the player ── */}
            {type === 'tv' && seriesData?.seasons && (
                <div className="watch-ep-selector">
                    <div className="watch-ep-seasons">
                        {seriesData.seasons
                            .filter(s => s.season_number > 0)
                            .map(s => (
                                <button
                                    key={s.season_number}
                                    className={`watch-ep-season-tab${panelSeason === s.season_number ? ' active' : ''}`}
                                    onClick={() => setPanelSeason(s.season_number)}
                                >
                                    S{s.season_number}
                                </button>
                            ))
                        }
                    </div>
                    <div className="watch-ep-episodes">
                        {(() => {
                            const seasonInfo = seriesData.seasons.find(s => s.season_number === panelSeason);
                            const count = seasonInfo?.episode_count || 0;
                            return Array.from({ length: count }, (_, i) => i + 1).map(epNum => (
                                <button
                                    key={epNum}
                                    className={`watch-ep-episode-btn${panelSeason === parseInt(season) && epNum === parseInt(episode) ? ' active' : ''}`}
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
        {/* ── Reviews section — below the player, outside watch-main ── */}
        <div className="watch-reviews-section">
                <p className="watch-reviews-title">REVIEWS</p>
                {reviews.length > 0 && (
                    <p className="watch-reviews-avg">
                        {'★'.repeat(Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length))}
                        {'☆'.repeat(5 - Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length))}
                        {' '}<span className="watch-reviews-avg-num">
                            {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}
                        </span>
                        <span className="watch-reviews-count"> ({reviews.length})</span>
                    </p>
                )}
                <div className="watch-review-form">
                    <textarea
                        className="watch-review-input"
                        placeholder="Write a review… (optional)"
                        value={reviewText}
                        onChange={e => setReviewText(e.target.value)}
                        maxLength={3000}
                        rows={6}
                    />
                    <div className="watch-review-form-right">
                        <div className="watch-review-stars">
                            {[1,2,3,4,5].map(n => (
                                <button key={n}
                                    className="watch-review-star-btn"
                                    onClick={() => setReviewRating(n)}
                                    onMouseEnter={() => setReviewHover(n)}
                                    onMouseLeave={() => setReviewHover(0)}
                                >
                                    {n <= (reviewHover || reviewRating) ? '★' : '☆'}
                                </button>
                            ))}
                        </div>
                        <button
                            className="watch-review-submit"
                            onClick={submitReview}
                            disabled={!reviewRating || reviewSubmitting}
                        >
                            {reviewSubmitting ? 'Submitting…' : 'Submit'}
                        </button>
                    </div>
                </div>
                <div className="watch-reviews-list">
                    {reviews.length === 0 ? (
                        <p className="watch-reviews-empty">No reviews yet. Be the first!</p>
                    ) : reviews.map((rv, i) => (
                        <div key={i} className="watch-review-card">
                            <div className="watch-review-card-header">
                                <span className="watch-review-card-user">{rv.username}</span>
                                <span className="watch-review-card-stars">
                                    {'★'.repeat(rv.rating)}{'☆'.repeat(5 - rv.rating)}
                                </span>
                            </div>
                            {rv.text ? <p className="watch-review-card-text">{rv.text}</p> : null}
                            <p className="watch-review-card-date">
                                {new Date(rv.timestamp).toLocaleDateString()}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
            {providerToast && (
                <div className="provider-toast">{providerToast}</div>
            )}
        </>
    );
  }

export function EpisodeDisplay(input) {
    const {data, season, episode, setSeason, setEpisode, maxEp, maxSe, id} = input
    return (
    <div className="watch-episode">
        {episode == 1 ? <button className="watch-episode-arrow">{" "}</button> : <button className="watch-episode-arrow" onClick={() => {localStorage.setItem("episode" + id, parseInt(episode) - 1); setEpisode(parseInt(episode) - 1)}}>{"<<"}</button>}
        <div className="watch-episode-display">
            <p className="watch-episode-display-title">{data == null ? "Loading.." : "Ep " + episode+ ": " + data.name}</p>
            <div className="watch-season-display">
                {season == 1 ? <button className="watch-season-arrow">{" "}</button> : <button className="watch-season-arrow" onClick={() => {localStorage.setItem("season" + id, parseInt(season) - 1); localStorage.setItem("episode" + id, 1); setSeason(parseInt(season) - 1); setEpisode(1)}}>{"<<"}</button>}
                <p className="watch-season-title">{"SEASON " + season}</p>
                {season == maxSe ? <button className="watch-season-arrow">{" "}</button> : <button className="watch-season-arrow" onClick={() => {localStorage.setItem("season" + id, parseInt(season) + 1); localStorage.setItem("episode" + id, 1); setSeason(parseInt(season) + 1); setEpisode(1)}}>{">>"}</button>}
            </div>
        </div>
        {episode == maxEp ? <button className="watch-episode-arrow" onClick={() => {localStorage.setItem("episode" + id, parseInt(episode) + 1); setEpisode(parseInt(episode) + 1)}}>{" >"}</button> : <button className="watch-episode-arrow" onClick={() => {localStorage.setItem("episode" + id, parseInt(episode) + 1); setEpisode(parseInt(episode) + 1)}}>{">>"}</button>}
    </div>
    );
  }

export function MovieDisplay(data) {
    console.log(data)
    return (
    <div className= "watch-movie">
        <p className= "watch-movie-title">{data == "" ? "Loading.." : data.data.title}</p>
    </div>
    );
}


  // <iframe id="player_iframe" src="https://gbf7wrqapjg1js045ye8.com/prorcp/NjFkNzc0YTU0YTBhZDI5OGZjYWQzYWYyNmNjNjk2MDc6Y1RGNVFuaFNia3BUUnpWa2RDdHpZMHQwVTJwaVNWUkNPVk41YlVKcVdGQnFiVTAyZDBGdVRGWnpSbXB5ZFVsMk4weFBZVWc0T0ZkeGNHMTBjMnM1WkhKV1JYZGFNVk5PVlU4MWJGWjVXbk52Y204eGVYUTNjbGR1TlUxYWRVMXBOMmRvTUd4RlpWUllkbkpVU2tGVlRFWkRNV2xuZFhWaE0xQkRWRTV6V21WMUt6bHhlR1UwWlU0M1owSk5aWHBPVURSbWNERlFWMkU1Y21sWU9WbExaVEJKVEd0SVJuWTFZaTl0TWxORmNrMW1RbEUzTjJkMVlsSkRhekZ1Um1sRlNXOW1XalJZZDJkbFdYcDNVWEpCWm1OaWVtUm9hR1o2Y25oMFN6TXlNbkV3Ukd0bFdVcFlVRFZzYUdSdlJWRXdNMjV2UlhCWmMwcE9XV1l5WnpKUVRWQnVibkpxS3pRMFNXUmthV3h1YkRSWFVXWkdiRFl5T1Rjd2RWWkVTbFpwZGxGNFRsTnVSakZLTDBWRVZuUTBLMU5EUmxsRGJEWkxlSEJTTDFsYU1XSmxTM2REVnpsR1lXaHpNRFpOV2paRWJVb3ZablpPV2k4NVZXeERNa1EzTURCS2FHSkVhV3Q0YTFvM1VtbHNSRzQwVFRNMWVqZFlSV3hxU21Kak4weFdWRXBxWjBkeGJqYzRWR05zVFRGdVFVeHRiRXR0WldadFRGVjFhek5LWmtkbVREaEphazVrUWpVMFJrbGlRMFpqYUd3dlQyNVljRUZuUld0SWFYZFhhbTFJTDBsQlZsSlhTVEJNT0dkQ2VYQm1jbVE0VkN0blIwdFljRGRGVkVZck1WVlliR2h2VXpkNk4zVkNMM0pCTDFBMGJFdzJlbWxZVm0xV1QxbEdibXBGWjNWTFJVbEpVR2hKWkZoVVpVdEpWa2wxVlhKTmNXdDRZMEpUYnpoQ2NIaEhNa2xvVkhad1VrdE9jRVpSZGxWUk1scFlUMmd4Y1hkaFRFOU1NV3hZZUU5ak9YaE9jRWhMYldSaFYzUkdkVFpuWkdWRWIyVnVPV0pNY0RWSE1FWmlaMmhDYVdoUlZFSjNjR1kzTjFaMGNXWkpWMGhIUVVFcmJuSmFjaXRvVlU5SFVtdzFjVkpWWTNob1RqQlBkV3BIWW1nM1FVaDJOMjVMYWsweWVXWmlTV2g1UkRKUVZ6UnNXRzVTVkVaQ09XcExjRUpsZDFJdmJVNUZXWEJZVG5sdVIyZHFheTlFU3paU09YRm1ZM0pRWmpoNVEwOUdjM2MwYlRkUE4wSmlaakl3VEc1T1JVSktkV1ZzTlVRMlNrZDVhRGxGYUhCd2FrRndiMEZ2YlVoTVlrVXZXbkZ1VUhWYVNEZFNiVXh4WW1oMFlWaFJibk42UVhsTGNsZEZkV3hsV0daWmVEaERiR1Z2TVhsSWNYVkZPR3B0WmpoT2NtRnBiWHBxYWs1bk5GWTNXRmM1ZDFscGJHOWxTbWx3WTBGUmRXRXZPR2xGYVhaNksxUnhWWGxzUld4eFFuUkpRbVpYVkdzdlJIVnNiMmRWWTFod2VVZFpjMjFoVEhadGMybEdiblZxV2xKVU1XTk5kR1pqY0Uxa2ExaHlPRlF2VlZoc2VWVTVUV05uUjJ3NUsxUjFTamwxYjFVdmR6UjFkbWxNZWt3elVWaFVlalZqWjNCcVNqTm1ZbWhJWVU1T1VYRTFOM1p1WkVVNVRtZG9RbFV5YVc1R2VUUTFMMFppVEVrMVQzSkpXR1JDYTFwSWJXaFZNV1ZFUld4WU5UTXdhMFppWkVOR2FWaGlLM1IwVm5oNGNUQmFkaXQyYUU5cWF6TkRZVnBKZFc1MlQxZFJabWRXUjBjeUsyRlRTMlZPSzNacmFWQmhNVlV2VUhsSFl6ZFRabGhZUkc4M2FFZG1ibXBxTnpsQlptbHhXR3BtSzI5bVVVdFRURWwwVDNvckwzVXJkRVowVDNaV1FWcHVaRTVFYVVKc1pXRjZORTB6UzJ3MFIwSnVTbE5FWmpsYU9Dc3JLMlJ6WTFSVmJFVlBTRnB0YTBKUGFIQkpkVkI0WWxSSldFUlVOSEJLU1UxTk5GSjVZVVp2VFhWWmVXRjBjVzlxVnpadGR6SjRLMEpxYjBGQ09IWnVaRzhyV2s5UE1tcFRZMjlLWVd4S2Rrb3ZhREJDVUdvclVUZ3lPRk16ZFRrcmJtYzBZMmhQVkhSV2FXcFpPV1phTXpOMGNqQmtUMVp0ZFRsWWRFcFRaaTluTVZkVlMxZHdLMlJNWVhGU1RqVmxhVVF2ZGxwVWJuVjNabEppU1ZvMFZUUk1lWFZFWm1WRllXOW5kVUZQY0dwcGRYTlRXbGhTVDJ0d1MwcERWbXhtTTFWclVGTjBUa056WTNFeGNuSnpkbm92UjNaS2FtZHlaejA5" frameborder="0" scrolling="no" allowfullscreen="yes" allow="autoplay"></iframe>