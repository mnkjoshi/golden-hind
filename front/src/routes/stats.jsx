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
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!user || !token) { navigate('/auth'); return; }
        axios.post(`${API}/stats/wrapped`, { user, token })
            .then(r => setData(r.data && typeof r.data === 'object' ? r.data : null))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hours = data ? data.totalSeconds / 3600 : 0;
    const maxMonth = data ? Math.max(1, ...data.byMonth.map(m => m.seconds)) : 1;
    const maxGenre = data?.genres?.length ? data.genres[0].seconds : 1;

    return (
        <div className="stats-page">
            <Topbar />
            <div className="stats-content">
                <h1 className="stats-title">Your Year on the Golden Hind</h1>

                {loading && <div className="stats-hint">Charting the waters…</div>}

                {!loading && (!data || data.sessionCount === 0) && (
                    <div className="stats-hint">
                        No voyages logged yet — watch something and check back.
                    </div>
                )}

                {!loading && data && data.sessionCount > 0 && (
                    <>
                        <div className="stats-hero">
                            <div className="stats-hero-card stats-hero-main">
                                <span className="stats-hero-number">{hours >= 100 ? Math.round(hours) : hours.toFixed(1)}</span>
                                <span className="stats-hero-label">hours watched</span>
                            </div>
                            <div className="stats-hero-card">
                                <span className="stats-hero-number">{data.sessionCount}</span>
                                <span className="stats-hero-label">sessions</span>
                            </div>
                            <div className="stats-hero-card">
                                <span className="stats-hero-number">{data.distinctDays}</span>
                                <span className="stats-hero-label">days aboard</span>
                            </div>
                        </div>

                        <div className="stats-section">
                            <h2>Last 12 months</h2>
                            <div className="stats-months">
                                {data.byMonth.map(m => (
                                    <div key={m.month} className="stats-month">
                                        <div className="stats-month-bar-wrap" title={`${monthLabel(m.month)}: ${formatWatchTime(m.seconds)}`}>
                                            <div className="stats-month-bar" style={{ height: `${Math.max(2, (m.seconds / maxMonth) * 100)}%` }} />
                                        </div>
                                        <span className="stats-month-label">{monthLabel(m.month)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="stats-columns">
                            <div className="stats-section">
                                <h2>Most watched</h2>
                                <div className="stats-top-list">
                                    {data.topTitles.map((t, i) => (
                                        <div
                                            key={t.contentId || t.name}
                                            className={`stats-top-row${t.contentId ? ' clickable' : ''}`}
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
                                    <div className="stats-section">
                                        <h2>Longest voyage</h2>
                                        <div className="stats-longest">
                                            <span className="stats-longest-time">{formatWatchTime(data.longestSession.seconds)}</span>
                                            <span className="stats-longest-name">{data.longestSession.name}</span>
                                            <span className="stats-longest-when">{formatRelativeTime(data.longestSession.timestamp)}</span>
                                        </div>
                                    </div>
                                )}

                                {data.genres?.length > 0 && (
                                    <div className="stats-section">
                                        <h2>Your genres</h2>
                                        <div className="stats-genres">
                                            {data.genres.map(g => (
                                                <div key={g.name} className="stats-genre-row">
                                                    <span className="stats-genre-name">{g.name}</span>
                                                    <div className="stats-genre-bar-wrap">
                                                        <div className="stats-genre-bar" style={{ width: `${Math.max(4, (g.seconds / maxGenre) * 100)}%` }} />
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
