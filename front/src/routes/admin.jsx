import { useNavigate } from "react-router-dom";
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar.jsx";
import { formatWatchTime } from '../utils/format.js';
import { ALERT_LABELS } from '../components/adminAlerts.jsx';

const BASE_URL = 'https://ghb.mnkjoshi.ca';

// Friendly one-line summary of an analytics event for the activity feed.
function describeEvent(evt) {
    const d = evt.data || {};
    switch (evt.event) {
        case 'session_start':
            return 'Logged on — fresh session';
        case 'search':
            return d.query ? `Searched "${d.query}"` : 'Searched';
        case 'detail_view':
            return `Opened ${d.name || d.id || 'a title'}`;
        case 'music_view':
            return `Music · ${d.page || '/music'}`;
        case 'music_play':
            return `Played ${d.title || d.videoId || 'a song'}${d.artist ? ` by ${d.artist}` : ''}`;
        case 'book_page':
            return 'Opened Books';
        case 'book_search':
            return d.query ? `Searched books for "${d.query}"` : 'Searched books';
        case 'book_download':
            return `Downloaded ${d.title || 'a book'}${d.author ? ` by ${d.author}` : ''}`;
        case 'watch':
            if (d.name) {
                return d.type === 'tv' && d.season
                    ? `Watched ${d.name} · S${d.season}E${d.episode}`
                    : `Watched ${d.name}`;
            }
            return `Watched ${d.id || 'unknown title'}`;
        default:
            return JSON.stringify(d);
    }
}

const EVENT_LABELS = {
    session_start: 'Session',
    search: 'Search',
    watch: 'Watch',
    detail_view: 'Details',
    music_view: 'Music',
    music_play: 'Song',
    book_page: 'Books',
    book_search: 'Book search',
    book_download: 'Book download',
};

export default function Admin() {
    const navigate = useNavigate();
    const [tab, setTab] = useState('errors');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newUser, setNewUser] = useState({ username: '', password: '', email: '' });
    const [createStatus, setCreateStatus] = useState('');
    const [creating, setCreating] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userActivity, setUserActivity] = useState(null);
    const [userActivityLoading, setUserActivityLoading] = useState(false);
    const [introBusy, setIntroBusy] = useState(false);
    const [moderationBusy, setModerationBusy] = useState(false);
    // YouTube backend check: null = not run yet, 'loading', or the result.
    const [ytHealth, setYtHealth] = useState(null);
    const [ytUpdating, setYtUpdating] = useState(false);
    // Activity feed filters (server-side, see /admin/analytics). Hiding your
    // own activity is on by default and remembered.
    const [hideMine, setHideMine] = useState(() => { try { return localStorage.getItem('adminHideMine') !== '0'; } catch { return true; } });
    const [userFilter, setUserFilter] = useState('');
    const [eventFilter, setEventFilter] = useState([]);
    const [feed, setFeed] = useState(null);   // { events, total, counts, people, activeUsers }
    const [feedLoading, setFeedLoading] = useState(false);
    const [moderationStatus, setModerationStatus] = useState('');

    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    const setIntro = async ({ enabled, bumpVersion }) => {
        setIntroBusy(true);
        try {
            await axios.post(`${BASE_URL}/admin/intro/set`, { user, token, enabled, bumpVersion });
            await fetchData();
        } catch {}
        setIntroBusy(false);
    };

    // Year in Review promo toast — reset re-issues it to every user by
    // bumping the promo version.
    const [promoBusy, setPromoBusy] = useState(false);
    const [promoVersion, setPromoVersion] = useState(null);
    useEffect(() => {
        axios.post(`${BASE_URL}/stats/promo-status`, { user, token })
            .then(r => setPromoVersion(r.data?.version || 1))
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const resetStatsPromo = async () => {
        setPromoBusy(true);
        try {
            const res = await axios.post(`${BASE_URL}/admin/stats-promo/reset`, { user, token });
            setPromoVersion(res.data?.version || null);
        } catch { /* surfaced by the unchanged version number */ }
        setPromoBusy(false);
    };

    useEffect(() => {
        document.title = 'Admin - The Golden Hind';
        if (user !== 'manav') {
            navigate('/app');
            return;
        }
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/admin/data`, { user, token });
            setData(res.data);
        } catch {
            navigate('/app');
        }
        setLoading(false);
    };

    const setNoComments = async (targetUser, enabled) => {
        setModerationBusy(true);
        setModerationStatus('');
        try {
            await axios.post(`${BASE_URL}/admin/set-no-comments`, { user, token, targetUser, enabled });
            await fetchData();
        } catch (e) {
            setModerationStatus('Error: ' + (e.response?.data || e.message));
        }
        setModerationBusy(false);
    };

    const archiveReviews = async (targetUser) => {
        if (!window.confirm(`Archive all of ${targetUser}'s reviews? They'll be hidden from every title.`)) return;
        setModerationBusy(true);
        setModerationStatus('');
        try {
            const res = await axios.post(`${BASE_URL}/admin/archive-reviews`, { user, token, targetUser });
            setModerationStatus(`Archived ${res.data.archived} review${res.data.archived === 1 ? '' : 's'}.`);
        } catch (e) {
            setModerationStatus('Error: ' + (e.response?.data || e.message));
        }
        setModerationBusy(false);
    };

    const loadFeed = async () => {
        setFeedLoading(true);
        try {
            const r = await axios.post(`${BASE_URL}/admin/analytics`, {
                user, token,
                filter: { excludeUsers: hideMine ? [user] : [], users: userFilter ? [userFilter] : [], events: eventFilter },
            });
            setFeed(r.data);
        } catch { /* keep the last result */ }
        setFeedLoading(false);
    };
    useEffect(() => {
        if (tab === 'analytics') loadFeed();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, hideMine, userFilter, eventFilter.join(',')]);
    const toggleHideMine = () => setHideMine(v => {
        try { localStorage.setItem('adminHideMine', v ? '0' : '1'); } catch { /* noop */ }
        return !v;
    });
    const toggleEvent = (type) => setEventFilter(list => (list.includes(type) ? list.filter(t => t !== type) : [...list, type]));

    const checkYt = async () => {
        setYtHealth('loading');
        try {
            const r = await axios.post(`${BASE_URL}/admin/yt-health`, { user, token });
            setYtHealth(r.data);
        } catch (e) {
            setYtHealth({ requestError: e.message });
        }
    };
    const updateYt = async () => {
        setYtUpdating(true);
        try { await axios.post(`${BASE_URL}/admin/yt-update`, { user, token }); } catch { /* the re-check shows the state */ }
        setYtUpdating(false);
        checkYt();
    };

    const openUserActivity = async (targetUser) => {
        setModerationStatus('');
        setSelectedUser(targetUser);
        setUserActivity(null);
        setUserActivityLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/admin/user-stats`, { user, token, targetUser });
            setUserActivity(res.data);
        } catch {
            setUserActivity({ sessions: [], totalSeconds: 0 });
        }
        setUserActivityLoading(false);
    };

    const createUser = async () => {
        if (!newUser.username || !newUser.password || !newUser.email) {
            setCreateStatus('All fields are required.');
            return;
        }
        setCreating(true);
        setCreateStatus('');
        try {
            const res = await axios.post(`${BASE_URL}/admin/create-user`, {
                user, token,
                newUsername: newUser.username,
                newPassword: newUser.password,
                newEmail: newUser.email,
            });
            switch (res.data) {
                case 'UCS':
                    setCreateStatus('User created successfully!');
                    setNewUser({ username: '', password: '', email: '' });
                    fetchData();
                    break;
                case 'UNT':
                    setCreateStatus('Username is already taken.');
                    break;
                case 'ET':
                    setCreateStatus('Email is already in use.');
                    break;
                case 'IUN':
                    setCreateStatus('Usernames can\'t contain spaces at the ends or . # $ [ ] /');
                    break;
                case 'IE':
                    setCreateStatus('That email address isn\'t valid.');
                    break;
                default:
                    setCreateStatus('Unexpected response: ' + res.data);
            }
        } catch (e) {
            setCreateStatus('Error: ' + e.message);
        }
        setCreating(false);
    };

    if (user !== 'manav') return null;

    if (loading) {
        return (
            <div className="admin-main">
                <Topbar />
                <div className="admin-loading">
                    <div className="admin-spinner"></div>
                    <p>Loading admin console...</p>
                </div>
            </div>
        );
    }

    const errors = data?.errors || [];
    const users = data?.users || [];
    const watchTotals = data?.watchTotals || {};
    const noCommentUsers = data?.noCommentUsers || [];
    const music = data?.music || {};
    const alerts = data?.alerts || [];
    const watchTotalAll = data?.watchTotalAll || 0;

    const introConfig = data?.introConfig || { enabled: true, version: 1 };
    const introSeenCount = data?.introSeenCount || 0;

    return (
        <>
        <div className="admin-main">
            <Topbar />
            <div className="admin-container">
                <div className="admin-header">
                    <div>
                        <h1 className="admin-title">Admin Console</h1>
                        <p className="admin-subtitle">Golden Hind — logged in as manav</p>
                    </div>
                    <button className="admin-refresh-btn" onClick={() => { fetchData(); if (tab === 'analytics') loadFeed(); }}>↺ Refresh</button>
                </div>

                {/* Welcome / intro video control */}
                <div className="intro-admin">
                    <div className="intro-admin-info">
                        <span className={`intro-admin-dot ${introConfig.enabled ? 'on' : 'off'}`} />
                        <div>
                            <div className="intro-admin-title">Welcome Video</div>
                            <div className="intro-admin-sub">
                                {introConfig.enabled ? 'Showing to new viewers' : 'Disabled'} · v{introConfig.version} · seen by {introSeenCount} {introSeenCount === 1 ? 'user' : 'users'}
                            </div>
                        </div>
                    </div>
                    <div className="intro-admin-actions">
                        <button
                            className={`intro-admin-btn ${introConfig.enabled ? 'danger' : 'primary'}`}
                            onClick={() => setIntro({ enabled: !introConfig.enabled })}
                            disabled={introBusy}
                        >
                            {introConfig.enabled ? 'Turn off' : 'Turn on'}
                        </button>
                        <button
                            className="intro-admin-btn"
                            onClick={() => setIntro({ bumpVersion: true })}
                            disabled={introBusy}
                            title="Bumps the version so everyone sees it again"
                        >
                            Re-show to everyone
                        </button>
                    </div>
                </div>

                {/* Year in Review promo toast control */}
                <div className="intro-admin">
                    <div className="intro-admin-info">
                        <span className="intro-admin-dot on" />
                        <div>
                            <div className="intro-admin-title">Year in Review Toast</div>
                            <div className="intro-admin-sub">
                                Nudges users who have not seen their stats page yet{promoVersion ? ` · v${promoVersion}` : ''}
                            </div>
                        </div>
                    </div>
                    <div className="intro-admin-actions">
                        <button
                            className="intro-admin-btn"
                            onClick={resetStatsPromo}
                            disabled={promoBusy}
                            title="Forgets everyone's seen-state so the toast shows again"
                        >
                            Re-issue to everyone
                        </button>
                    </div>
                </div>

                {/* YouTube backend health (yt-dlp, cookies, live tests) */}
                <div className="intro-admin yt-health">
                    <div className="intro-admin-info">
                        <span className={`intro-admin-dot ${ytHealth && typeof ytHealth === 'object' && !ytHealth.requestError ? (ytHealth.download?.ok && ytHealth.search?.ok ? 'on' : 'bad') : 'off'}`} />
                        <div>
                            <div className="intro-admin-title">YouTube backend</div>
                            <div className="intro-admin-sub">
                                {ytHealth === null && 'Checks yt-dlp, cookies, a song lookup and a search.'}
                                {ytHealth === 'loading' && 'Checking… (takes up to ~45s)'}
                                {ytHealth?.requestError && `Could not run the check: ${ytHealth.requestError}`}
                                {ytHealth && typeof ytHealth === 'object' && !ytHealth.requestError && (
                                    <>yt-dlp {ytHealth.version || 'not found'}
                                        {ytHealth.managed ? ` · self-updating${ytHealth.upkeep?.lastUpdate ? `, last ${new Date(ytHealth.upkeep.lastUpdate).toLocaleString()}` : ''}` : ' · not self-managed'}
                                        {' · '}cookies {ytHealth.cookies ? `${ytHealth.cookies.ageDays}d old${ytHealth.cookies.usable ? '' : ' (not readable)'}` : 'missing'}</>
                                )}
                            </div>
                            {ytHealth && typeof ytHealth === 'object' && !ytHealth.requestError && (
                                <div className="yt-health-tests">
                                    {[['Song lookup', ytHealth.download], ['Search', ytHealth.search]].map(([label, r]) => (
                                        <div key={label} className={`yt-health-test ${r?.ok ? 'ok' : 'fail'}`}>
                                            <strong>{label}:</strong> {r?.ok ? `OK in ${(r.ms / 1000).toFixed(1)}s` : `${r?.advice || 'Failed'}`}
                                            {!r?.ok && r?.error && <div className="yt-health-error">{r.error}</div>}
                                        </div>
                                    ))}
                                    {ytHealth.upkeep?.error && <div className="yt-health-test fail"><strong>Last update:</strong> failed — {ytHealth.upkeep.error}</div>}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="intro-admin-actions">
                        <button className="intro-admin-btn" onClick={checkYt} disabled={ytHealth === 'loading'}>Check now</button>
                        <button className="intro-admin-btn" onClick={updateYt} disabled={ytUpdating || ytHealth === 'loading'}>{ytUpdating ? 'Updating…' : 'Update yt-dlp'}</button>
                    </div>
                </div>

                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${tab === 'errors' ? 'active' : ''}`}
                        onClick={() => setTab('errors')}
                    >
                        Errors
                        {errors.length > 0 && <span className="tab-badge error">{errors.length}</span>}
                    </button>
                    <button
                        className={`admin-tab ${tab === 'alerts' ? 'active' : ''}`}
                        onClick={() => setTab('alerts')}
                    >
                        Alerts
                        <span className="tab-badge">{alerts.length}</span>
                    </button>
                    <button
                        className={`admin-tab ${tab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setTab('analytics')}
                    >
                        Analytics
                        {feed && <span className="tab-badge">{feed.total}</span>}
                    </button>
                    <button
                        className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
                        onClick={() => setTab('users')}
                    >
                        Users
                        <span className="tab-badge">{users.length}</span>
                    </button>
                </div>

                {/* ERRORS TAB */}
                {tab === 'errors' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">Server Errors <span className="panel-subtitle-inline">(last 100)</span></h2>
                        {errors.length === 0 ? (
                            <div className="admin-empty">
                                <span className="admin-empty-icon">✓</span>
                                <p>No errors logged. All systems nominal.</p>
                            </div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table admin-table-cards">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>User</th>
                                            <th>Endpoint</th>
                                            <th>Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {errors.map((err, i) => (
                                            <tr key={i} className="error-row">
                                                <td className="td-time">{new Date(err.timestamp).toLocaleString()}</td>
                                                <td className="td-user">{err.user}</td>
                                                <td className="td-endpoint">{err.endpoint}</td>
                                                <td className="td-msg">{err.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ALERTS TAB — the same notices that pop up */}
                {tab === 'alerts' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">Alerts <span className="panel-subtitle-inline">(last 100)</span></h2>
                        {alerts.length === 0 ? (
                            <div className="admin-empty">
                                <span className="admin-empty-icon">✓</span>
                                <p>Nothing yet. Sign-ups, settings changes, new errors and new power users show up here.</p>
                            </div>
                        ) : (
                            <div className="admin-alert-list">
                                {alerts.map(a => (
                                    <div key={a.id} className="admin-alert-row">
                                        <span className={`event-pill alert-pill alert-${a.type}`}>{ALERT_LABELS[a.type] || a.type}</span>
                                        <span className="admin-alert-row-msg">{a.message}</span>
                                        <span className="admin-alert-row-time">{new Date(a.timestamp).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ANALYTICS TAB */}
                {tab === 'analytics' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">Analytics</h2>

                        <div className="admin-filters">
                            <button className={`admin-toggle${hideMine ? ' on' : ''}`} onClick={toggleHideMine} aria-pressed={hideMine}>
                                <span className="admin-toggle-knob" />Hide my activity
                            </button>
                            <select className="admin-select" value={userFilter} onChange={e => setUserFilter(e.target.value)} aria-label="Filter by person">
                                <option value="">Everyone</option>
                                {(feed?.people || []).filter(p => !(hideMine && p === user)).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {(eventFilter.length > 0 || userFilter) && (
                                <button className="admin-filter-clear" onClick={() => { setEventFilter([]); setUserFilter(''); }}>Clear filters</button>
                            )}
                        </div>
                        <div className="admin-chips" role="group" aria-label="Event types">
                            {Object.entries(feed?.counts || {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                                <button
                                    key={type}
                                    className={`admin-chip event-${type}${eventFilter.includes(type) ? ' on' : ''}`}
                                    onClick={() => toggleEvent(type)}
                                    aria-pressed={eventFilter.includes(type)}
                                >
                                    {EVENT_LABELS[type] || type}<span className="admin-chip-count">{count}</span>
                                </button>
                            ))}
                        </div>

                        <div className="analytics-stats">
                            <div className="stat-card">
                                <div className="stat-value">{feed ? feed.total : '…'}</div>
                                <div className="stat-label">Matching events</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{feed ? feed.activeUsers : '…'}</div>
                                <div className="stat-label">Active users</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{formatWatchTime(watchTotalAll)}</div>
                                <div className="stat-label">Total watch time</div>
                            </div>
                        </div>

                        <h3 className="panel-section-title">Recent Activity{feedLoading ? ' · updating…' : ''}</h3>
                        {feed && feed.events.length === 0 ? (
                            <div className="admin-empty">
                                <p>No activity matches these filters.</p>
                            </div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table admin-table-cards">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>User</th>
                                            <th>Event</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(feed?.events || []).map((evt, i) => (
                                            <tr key={i}>
                                                <td className="td-time">{new Date(evt.timestamp).toLocaleString()}</td>
                                                <td className="td-user">{evt.user}</td>
                                                <td className="td-endpoint">
                                                    <span className={`event-pill event-${evt.event}`}>{EVENT_LABELS[evt.event] || evt.event}</span>
                                                </td>
                                                <td className="td-msg">{describeEvent(evt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* USERS TAB */}
                {tab === 'users' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">User Generator</h2>
                        <div className="user-gen-form">
                            <div className="gen-fields">
                                <input
                                    className="admin-input"
                                    placeholder="Username"
                                    value={newUser.username}
                                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                    disabled={creating}
                                />
                                <input
                                    className="admin-input"
                                    placeholder="Email address"
                                    type="email"
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    disabled={creating}
                                />
                                <input
                                    className="admin-input"
                                    placeholder="Password"
                                    type="password"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    disabled={creating}
                                />
                                <button
                                    className="admin-btn"
                                    onClick={createUser}
                                    disabled={creating}
                                >
                                    {creating ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                            {createStatus && (
                                <p className={`create-status ${createStatus.includes('successfully') ? 'success' : 'failure'}`}>
                                    {createStatus}
                                </p>
                            )}
                        </div>

                        <h3 className="panel-section-title">All Users ({users.length}) — tap to view activity</h3>
                        <div className="users-grid">
                            {[...users].sort((a, b) => (watchTotals[b] || 0) - (watchTotals[a] || 0)).map(u => (
                                <button key={u} className={`user-chip user-chip-btn ${u === 'manav' ? 'admin-chip' : ''}`} onClick={() => openUserActivity(u)}>
                                    {u === 'manav' && <span className="chip-crown">★</span>}
                                    <span className="chip-name">{u}</span>
                                    {watchTotals[u] > 0 && <span className="chip-watchtime">{formatWatchTime(watchTotals[u])}</span>}
                                    {music[u]?.songs > 0 && <span className="chip-music" title="Songs in their music library">♪ {music[u].songs}</span>}
                                    {noCommentUsers.includes(u) && <span className="chip-no-comments">no comments</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

            {/* User Activity Modal */}
            {selectedUser && (
                <div className="admin-modal-backdrop" onClick={() => setSelectedUser(null)}>
                    <div className="admin-modal-box" onClick={e => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2 className="admin-modal-title">Activity — {selectedUser}</h2>
                            <button className="admin-modal-close" onClick={() => setSelectedUser(null)}>×</button>
                        </div>
                        {userActivityLoading ? (
                            <div className="admin-modal-loading">
                                <div className="admin-spinner"></div>
                            </div>
                        ) : (
                            <div className="admin-modal-body">
                                <div className="admin-moderation">
                                    <button
                                        className={`admin-moderation-btn${noCommentUsers.includes(selectedUser) ? ' on' : ''}`}
                                        disabled={moderationBusy}
                                        onClick={() => setNoComments(selectedUser, !noCommentUsers.includes(selectedUser))}
                                    >
                                        {noCommentUsers.includes(selectedUser) ? 'No-comment mode: on' : 'No-comment mode: off'}
                                    </button>
                                    <button
                                        className="admin-moderation-btn danger"
                                        disabled={moderationBusy}
                                        onClick={() => archiveReviews(selectedUser)}
                                    >
                                        Archive all reviews
                                    </button>
                                    {moderationStatus && <span className="admin-moderation-status">{moderationStatus}</span>}
                                </div>
                                <div className="admin-activity-stats">
                                    <div className="admin-activity-stat">
                                        <div className="admin-activity-stat-value">{formatWatchTime(userActivity?.totalSeconds || 0)}</div>
                                        <div className="admin-activity-stat-label">Total Watch Time</div>
                                    </div>
                                    <div className="admin-activity-stat">
                                        <div className="admin-activity-stat-value">{userActivity?.sessions?.length || 0}</div>
                                        <div className="admin-activity-stat-label">Sessions</div>
                                    </div>
                                    <div className="admin-activity-stat">
                                        <div className="admin-activity-stat-value">{music[selectedUser]?.songs || 0}</div>
                                        <div className="admin-activity-stat-label">Songs · {music[selectedUser]?.playlists || 0} playlists</div>
                                    </div>
                                    <div className="admin-activity-stat">
                                        <div className="admin-activity-stat-value">{formatWatchTime(music[selectedUser]?.listenSeconds || 0)}</div>
                                        <div className="admin-activity-stat-label">Listened</div>
                                    </div>
                                </div>
                                {(!userActivity?.sessions || userActivity.sessions.length === 0) ? (
                                    <p className="admin-modal-empty">No sessions recorded for this user.</p>
                                ) : (
                                    <div className="admin-activity-list">
                                        {userActivity.sessions.map((s, i) => (
                                            <div key={i} className="admin-activity-item">
                                                <div className="admin-activity-name">{s.contentName || 'Unknown Title'}</div>
                                                <div className="admin-activity-meta">
                                                    <span className="admin-activity-duration">{formatWatchTime(s.duration)}</span>
                                                    <span className="admin-activity-date">
                                                        {new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
