// Year in review — lifetime watch statistics rendered from /stats/wrapped
// (aggregation lives in back/lib/stats.js; this page only formats).
import { useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Topbar from '../components/topbar';
import { formatWatchTime, formatRelativeTime } from '../utils/format.js';

const API = 'https://ghb.mnkjoshi.ca';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym) => MONTH_SHORT[parseInt(String(ym).slice(5)) - 1] || '';

export default function Stats() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    // Entrance choreography: `mounted` flips one frame after data arrives so
    // bars transition from zero, and the hero number counts up via rAF.
    const [mounted, setMounted] = useState(false);
    const [displayHours, setDisplayHours] = useState(0);
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!user || !token) { navigate('/auth'); return; }
        axios.post(`${API}/stats/wrapped`, { user, token })
            .then(r => setData(r.data && typeof r.data === 'object' ? r.data : null))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
        // Seeing the page satisfies the promo toast, however the user got here.
        axios.post(`${API}/stats/promo-seen`, { user, token }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Opening reveal: the page starts dark and counts down the top 3 —
    // each place gets a full-screen card with its trailer playing muted for
    // ~5s, ending on #1, then the intro clears and the real page animates in.
    const [trailerKeys, setTrailerKeys] = useState({});
    const [introStep, setIntroStep] = useState(0);   // 0 → #3, 1 → #2, 2 → #1
    const [introLeaving, setIntroLeaving] = useState(false);
    const [introDone, setIntroDone] = useState(false);
    const reducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top3 = data?.topTitles?.filter(t => t.contentId).slice(0, 3) || [];
    const hasShowdown = top3.length === 3;

    useEffect(() => {
        if (!data) return;
        if (!hasShowdown || reducedMotion) { setIntroDone(true); return; }
        top3.forEach(t => {
            axios.post(`${API}/home-trailer`, {
                user, token,
                tmdbId: parseInt(t.contentId.slice(1)),
                mediaType: t.contentId[0] === 't' ? 'tv' : 'movie',
            }).then(r => {
                if (r.data?.key) setTrailerKeys(prev => ({ ...prev, [t.contentId]: r.data.key }));
            }).catch(() => {});
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // Advance the countdown: ~5s of trailer per card, brief fade between.
    useEffect(() => {
        if (!data || introDone || !hasShowdown || reducedMotion) return;
        const leave = setTimeout(() => setIntroLeaving(true), 5400);
        const advance = setTimeout(() => {
            setIntroLeaving(false);
            if (introStep >= 2) setIntroDone(true);
            else setIntroStep(introStep + 1);
        }, 6000);
        return () => { clearTimeout(leave); clearTimeout(advance); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, introStep, introDone]);

    useEffect(() => {
        if (!data || !introDone) return;
        let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setMounted(true)); });
        const target = data.totalSeconds / 3600;
        const t0 = performance.now();
        const DURATION = 1600;
        let countRaf;
        const tick = (t) => {
            const p = Math.min(1, (t - t0) / DURATION);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplayHours(target * eased);
            if (p < 1) countRaf = requestAnimationFrame(tick);
        };
        countRaf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); cancelAnimationFrame(countRaf); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, introDone]);

    const hours = data ? data.totalSeconds / 3600 : 0;
    const maxMonth = data ? Math.max(1, ...data.byMonth.map(m => m.seconds)) : 1;
    const maxGenre = data?.genres?.length ? data.genres[0].seconds : 1;

    return (
        <div className="stats-page">
            <Topbar />

            {!loading && data && data.sessionCount > 0 && hasShowdown && !introDone && (() => {
                const order = [top3[2], top3[1], top3[0]]; // countdown: #3 → #2 → #1
                const current = order[introStep];
                const rank = 3 - introStep;
                const trailerKey = trailerKeys[current.contentId];
                const kicker = ['Third place', 'Second place', 'Your most watched'][introStep];
                return (
                    <div className="stats-intro">
                        <div key={introStep} className={`stats-intro-card${introLeaving ? ' leaving' : ''}`}>
                            {trailerKey ? (
                                <iframe
                                    className="stats-intro-video"
                                    src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
                                    title=""
                                    tabIndex={-1}
                                    allow="autoplay; encrypted-media"
                                />
                            ) : current.backdrop_path ? (
                                <div
                                    className="stats-intro-backdrop"
                                    style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w1280${current.backdrop_path})` }}
                                />
                            ) : null}
                            <div className="stats-intro-scrim" />
                            <div className="stats-intro-content">
                                <span className="stats-intro-kicker">{kicker}</span>
                                <span className={`stats-intro-rank rank-${rank}`}>#{rank}</span>
                                <h2 className="stats-intro-name">{current.name}</h2>
                                <span className="stats-intro-meta">
                                    {formatWatchTime(current.seconds)} · {current.sessions} session{current.sessions === 1 ? '' : 's'}
                                </span>
                            </div>
                        </div>
                        <button className="stats-intro-skip" onClick={() => setIntroDone(true)}>Skip</button>
                    </div>
                );
            })()}
            <div className="stats-content">
                <h1 className="stats-title">Your Year on the Golden Hind</h1>

                {loading && <div className="stats-hint">Charting the waters…</div>}

                {!loading && (!data || data.sessionCount === 0) && (
                    <div className="stats-hint">
                        No voyages logged yet — watch something and check back.
                    </div>
                )}

                {!loading && data && data.sessionCount > 0 && introDone && (
                    <>
                        <div className="stats-hero">
                            <div className="stats-hero-card stats-hero-main stats-anim">
                                <span className="stats-hero-number">{hours >= 100 ? Math.round(displayHours) : displayHours.toFixed(1)}</span>
                                <span className="stats-hero-label">hours watched</span>
                            </div>
                            <div className="stats-hero-card stats-anim" style={{ animationDelay: '120ms' }}>
                                <span className="stats-hero-number">{data.sessionCount}</span>
                                <span className="stats-hero-label">sessions</span>
                            </div>
                            <div className="stats-hero-card stats-anim" style={{ animationDelay: '240ms' }}>
                                <span className="stats-hero-number">{data.distinctDays}</span>
                                <span className="stats-hero-label">days aboard</span>
                            </div>
                        </div>

                        <div className="stats-section stats-anim" style={{ animationDelay: '320ms' }}>
                            <h2>Last 12 months</h2>
                            <div className="stats-months">
                                {data.byMonth.map((m, i) => (
                                    <div key={m.month} className="stats-month">
                                        <div className="stats-month-bar-wrap" title={`${monthLabel(m.month)}: ${formatWatchTime(m.seconds)}`}>
                                            <div
                                                className="stats-month-bar"
                                                style={{
                                                    height: mounted ? `${Math.max(2, (m.seconds / maxMonth) * 100)}%` : '0%',
                                                    transitionDelay: `${400 + i * 45}ms`,
                                                }}
                                            />
                                        </div>
                                        <span className="stats-month-label">{monthLabel(m.month)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="stats-columns">
                            <div className="stats-section stats-anim" style={{ animationDelay: '420ms' }}>
                                <h2>Most watched</h2>
                                <div className="stats-top-list">
                                    {data.topTitles.map((t, i) => (
                                        <div
                                            key={t.contentId || t.name}
                                            className={`stats-top-row stats-anim${t.contentId ? ' clickable' : ''}`}
                                            style={{ animationDelay: `${520 + i * 90}ms` }}
                                            onClick={() => t.contentId && navigate(`/detail/${t.contentId}`)}
                                        >
                                            <span className="stats-top-rank">{i + 1}</span>
                                            {t.poster_path
                                                ? <img className="stats-top-poster" src={`https://image.tmdb.org/t/p/w92${t.poster_path}`} alt="" />
                                                : <div className="stats-top-poster stats-top-poster-empty" />}
                                            <div className="stats-top-info">
                                                <span className="stats-top-name">{t.name}</span>
                                                <span className="stats-top-meta">{formatWatchTime(t.seconds)} · {t.sessions} session{t.sessions === 1 ? '' : 's'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="stats-side">
                                {data.longestSession && (
                                    <div className="stats-section stats-anim" style={{ animationDelay: '520ms' }}>
                                        <h2>Longest voyage</h2>
                                        <div className="stats-longest">
                                            <span className="stats-longest-time">{formatWatchTime(data.longestSession.seconds)}</span>
                                            <span className="stats-longest-name">{data.longestSession.name}</span>
                                            <span className="stats-longest-when">{formatRelativeTime(data.longestSession.timestamp)}</span>
                                        </div>
                                    </div>
                                )}

                                {data.genres?.length > 0 && (
                                    <div className="stats-section stats-anim" style={{ animationDelay: '640ms' }}>
                                        <h2>Your genres</h2>
                                        <div className="stats-genres">
                                            {data.genres.map((g, i) => (
                                                <div key={g.name} className="stats-genre-row">
                                                    <span className="stats-genre-name">{g.name}</span>
                                                    <div className="stats-genre-bar-wrap">
                                                        <div
                                                            className="stats-genre-bar"
                                                            style={{
                                                                width: mounted ? `${Math.max(4, (g.seconds / maxGenre) * 100)}%` : '0%',
                                                                transitionDelay: `${750 + i * 110}ms`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
