import { useNavigate, useLocation } from "react-router-dom";
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import TextLogo from '../assets/TextLogo.png';
import TextLogoGlitch1 from '../assets/TextLogoGlitch1.png';
import TextLogoGlitch2 from '../assets/TextLogoGlitch2.png';
import TextLogoGlitch3 from '../assets/TextLogoGlitch3.png';
import TextLogoGlitch4 from '../assets/TextLogoGlitch4.png';
import TextLogoGlitch5 from '../assets/TextLogoGlitch5.png';

const GLITCH_FRAMES = [TextLogoGlitch1, TextLogoGlitch2, TextLogoGlitch3, TextLogoGlitch4, TextLogoGlitch5];

const BASE_URL = 'https://goldenhind.tech';

function formatWatchTime(seconds) {
    if (!seconds || seconds < 1) return '0m';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Topbar() {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [isScrolled, setIsScrolled] = useState(false);
    const [tvMode, setTvMode] = useState(() => localStorage.getItem('tvMode') === 'on');

    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [searchHistory, setSearchHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem('searchHistory') || '[]'); } catch { return []; }
    });
    const suggestDebounceRef = useRef(null);
    const searchWrapperRef = useRef(null);

    // Account modal
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [accountInfo, setAccountInfo] = useState(null);
    const [accountLoading, setAccountLoading] = useState(false);
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwStatus, setPwStatus] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    // Activity modal
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [activityData, setActivityData] = useState(null);
    const [activityLoading, setActivityLoading] = useState(false);

    const [logoSrc, setLogoSrc] = useState(TextLogo);
    const glitchIntervalRef = useRef(null);
    const lastGlitchIndexRef = useRef(-1);

    const startGlitch = () => {
        glitchIntervalRef.current = setInterval(() => {
            let next;
            do { next = Math.floor(Math.random() * GLITCH_FRAMES.length); } while (next === lastGlitchIndexRef.current);
            lastGlitchIndexRef.current = next;
            setLogoSrc(GLITCH_FRAMES[next]);
        }, 80);
    };

    const stopGlitch = () => {
        clearInterval(glitchIntervalRef.current);
        setLogoSrc(TextLogo);
    };

    const navigate = useNavigate();
    const location = useLocation();
    const dropdownRef = useRef(null);

    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 0);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        localStorage.setItem('tvMode', tvMode ? 'on' : 'off');
        document.body.classList.toggle('tv-control-active', tvMode);
        window.dispatchEvent(new CustomEvent('tv-mode-change', { detail: { enabled: tvMode } }));
    }, [tvMode]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
                setShowSearchDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setShowAccountModal(false);
                setShowActivityModal(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, []);

    const commitSearch = (query) => {
        const q = query.trim();
        if (!q) return;
        const updated = [q, ...searchHistory.filter(h => h !== q)].slice(0, 8);
        setSearchHistory(updated);
        localStorage.setItem('searchHistory', JSON.stringify(updated));
        setShowSearchDropdown(false);
        setSuggestions([]);
        clearTimeout(suggestDebounceRef.current);
        if (location.pathname === '/books') {
            navigate('/books', { state: { searched: q } });
        } else {
            navigate('/search', { state: { searched: q } });
        }
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter') commitSearch(searchValue);
        if (e.key === 'Escape') setShowSearchDropdown(false);
    };

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchValue(val);
        clearTimeout(suggestDebounceRef.current);
        if (val.trim().length < 2) { setSuggestions([]); return; }
        suggestDebounceRef.current = setTimeout(async () => {
            setSuggestionsLoading(true);
            try {
                const res = await axios.post('https://goldenhind.tech/search', { query: val.trim() });
                const raw = res.data;
                const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
                setSuggestions((list || []).slice(0, 5));
            } catch { setSuggestions([]); }
            setSuggestionsLoading(false);
        }, 300);
    };

    const removeFromHistory = (e, item) => {
        e.stopPropagation();
        const updated = searchHistory.filter(h => h !== item);
        setSearchHistory(updated);
        localStorage.setItem('searchHistory', JSON.stringify(updated));
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/auth');
        setDropdownOpen(false);
    };

    const openAccountModal = async () => {
        setDropdownOpen(false);
        setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwStatus('');
        setShowAccountModal(true);
        if (!accountInfo) {
            setAccountLoading(true);
            try {
                const res = await axios.post(`${BASE_URL}/account/info`, { user, token });
                setAccountInfo(res.data);
            } catch {
                setAccountInfo({ username: user, email: 'Failed to load' });
            }
            setAccountLoading(false);
        }
    };

    const openActivityModal = async () => {
        setDropdownOpen(false);
        setShowActivityModal(true);
        setActivityLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/user/stats`, { user, token });
            setActivityData(res.data);
        } catch {
            setActivityData({ sessions: [], totalSeconds: 0 });
        }
        setActivityLoading(false);
    };

    const changePassword = async () => {
        if (!currentPw || !newPw || !confirmPw) {
            setPwStatus('error:All fields are required.');
            return;
        }
        if (newPw !== confirmPw) {
            setPwStatus('error:New passwords do not match.');
            return;
        }
        if (newPw.length < 6) {
            setPwStatus('error:Password must be at least 6 characters.');
            return;
        }
        setPwSaving(true);
        setPwStatus('');
        try {
            const res = await axios.post(`${BASE_URL}/account/change-password`, {
                user, token, currentPassword: currentPw, newPassword: newPw
            });
            switch (res.data) {
                case 'PUS':
                    setPwStatus('success:Password updated successfully!');
                    setCurrentPw(''); setNewPw(''); setConfirmPw('');
                    break;
                case 'ILD':
                    setPwStatus('error:Incorrect current password.');
                    break;
                case 'PWS':
                    setPwStatus('error:New password must be at least 6 characters.');
                    break;
                default:
                    setPwStatus('error:An unknown error occurred.');
            }
        } catch {
            setPwStatus('error:Failed to reach server.');
        }
        setPwSaving(false);
    };

    const pwStatusType = pwStatus.startsWith('success') ? 'success' : 'error';
    const pwStatusText = pwStatus.replace(/^(success|error):/, '');

    return (
        <>
            <nav className={`modern-topbar ${isScrolled ? 'scrolled' : ''}`}>
                <div className="topbar-content">
                    {/* Logo */}
                    <div className="topbar-left">
                        <button className="topbar-logo" onClick={() => navigate('/app')} onMouseEnter={startGlitch} onMouseLeave={stopGlitch}>
                            <img src={logoSrc} alt="Golden Hind" className="logo-text" />
                        </button>
                    </div>

                    {/* Navigation Links */}
                    <div className="topbar-nav">
                        <button className={`nav-link ${location.pathname === '/app' ? 'active' : ''}`} onClick={() => navigate('/app')}>
                            <svg viewBox="0 0 24 24" fill="none"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span>Home</span>
                        </button>
                        <button className={`nav-link ${location.pathname === '/search' ? 'active' : ''}`} onClick={() => navigate('/search')}>
                            <svg viewBox="0 0 24 24" fill="none"><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span>Search</span>
                        </button>
                        <button className={`nav-link ${location.pathname === '/books' ? 'active' : ''}`} onClick={() => navigate('/books')}>
                            <svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span>Books</span>
                        </button>
                        <button className={`nav-link ${location.pathname === '/music' ? 'active' : ''}`} onClick={() => navigate('/music')}>
                            <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.75"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.75"/></svg>
                            <span>Music</span>
                        </button>
                        {user === 'manav' && (
                            <button className={`nav-link admin-nav-link ${location.pathname === '/admin' ? 'active' : ''}`} onClick={() => navigate('/admin')}>
                                <svg viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                <span>Admin</span>
                            </button>
                        )}
                    </div>

                    {/* Right Side */}
                    <div className="topbar-right">
                        <button
                            className={`tv-mode-toggle ${tvMode ? 'active' : ''}`}
                            type="button"
                            onClick={() => setTvMode(prev => !prev)}
                            aria-pressed={tvMode}
                            title="TV remote mode"
                        >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <rect x="6" y="3" width="12" height="18" rx="4" stroke="currentColor" strokeWidth="1.8"/>
                                <path d="M12 7v4m0 0 2-2m-2 2-2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                <circle cx="12" cy="15.5" r="1.6" fill="currentColor"/>
                            </svg>
                            <span>TV</span>
                        </button>

                        {/* Mobile search icon - only visible on small screens */}
                        <button className="topbar-search-icon-btn" onClick={() => navigate('/search')}>
                            <svg viewBox="0 0 24 24" fill="none">
                                <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>

                        <div className="search-container" ref={searchWrapperRef}>
                            <div className="search-wrapper">
                                <svg className="search-icon" viewBox="0 0 24 24" fill="none">
                                    <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <input
                                    className="search-input"
                                    type="text"
                                    placeholder="Search movies, TV shows..."
                                    value={searchValue}
                                    onChange={handleSearchChange}
                                    onKeyDown={handleSearch}
                                    onFocus={() => setShowSearchDropdown(true)}
                                    autoComplete="off"
                                />
                            </div>
                            {showSearchDropdown && (suggestionsLoading || suggestions.length > 0 || (searchValue.trim().length < 2 && searchHistory.length > 0)) && (
                                <div className="search-dropdown">
                                    {suggestionsLoading && (
                                        <div className="suggestion-loading">Searching…</div>
                                    )}
                                    {!suggestionsLoading && suggestions.length > 0 && suggestions.map((s, i) => (
                                        <div
                                            key={i}
                                            className="suggestion-item"
                                            onMouseDown={() => { const t = s.title || s.name || ''; setSearchValue(t); commitSearch(t); }}
                                        >
                                            <svg className="suggestion-search-icon" viewBox="0 0 24 24" fill="none">
                                                <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                            <span className="suggestion-text">{s.title || s.name}</span>
                                            <span className={`suggestion-badge suggestion-badge-${s.media_type === 'movie' ? 'movie' : 'tv'}`}>
                                                {s.media_type === 'movie' ? 'Movie' : 'TV'}
                                            </span>
                                        </div>
                                    ))}
                                    {!suggestionsLoading && suggestions.length === 0 && searchValue.trim().length < 2 && searchHistory.length > 0 && (
                                        <div className="search-history-section">
                                            <div className="search-history-label">Recent searches</div>
                                            <div className="search-history-chips">
                                                {searchHistory.map((h, i) => (
                                                    <div key={i} className="search-history-chip" onMouseDown={() => { setSearchValue(h); commitSearch(h); }}>
                                                        <span>{h}</span>
                                                        <button className="history-chip-remove" onMouseDown={(e) => removeFromHistory(e, h)}>×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="account-section" ref={dropdownRef}>
                            <button className="account-button" onClick={() => setDropdownOpen(!dropdownOpen)}>
                                <div className="user-avatar">
                                    {user?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <span className="username">{user || 'Guest'}</span>
                                <svg className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`} viewBox="0 0 24 24" fill="none">
                                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>

                            {dropdownOpen && (
                                <div className="account-dropdown">
                                    <button className="dropdown-item" onClick={openAccountModal}>
                                        <svg viewBox="0 0 24 24" fill="none">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        Account
                                    </button>
                                    <button className="dropdown-item" onClick={openActivityModal}>
                                        <svg viewBox="0 0 24 24" fill="none">
                                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        Activity
                                    </button>
                                    <div className="dropdown-divider"></div>
                                    <button className="dropdown-item logout" onClick={handleLogout}>
                                        <svg viewBox="0 0 24 24" fill="none">
                                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {/* ── Account Settings Modal ── */}
            {showAccountModal && (
                <div className="modal-backdrop" onClick={() => setShowAccountModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Account Settings</h2>
                            <button className="modal-close" onClick={() => setShowAccountModal(false)}>×</button>
                        </div>
                        {accountLoading ? (
                            <div className="modal-loading"><div className="modal-spinner"></div></div>
                        ) : (
                            <div className="modal-body">
                                <div className="info-grid">
                                    <div className="info-row">
                                        <span className="info-label">Username</span>
                                        <span className="info-value">{accountInfo?.username || user}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Email</span>
                                        <span className="info-value">{accountInfo?.email || '—'}</span>
                                    </div>
                                </div>

                                <div className="modal-divider"></div>
                                <h3 className="modal-section-title">Change Password</h3>

                                <div className="modal-field">
                                    <label className="modal-label">Current Password</label>
                                    <input
                                        type="password"
                                        className="modal-input"
                                        placeholder="Enter current password"
                                        value={currentPw}
                                        onChange={e => setCurrentPw(e.target.value)}
                                        disabled={pwSaving}
                                    />
                                </div>
                                <div className="modal-field">
                                    <label className="modal-label">New Password</label>
                                    <input
                                        type="password"
                                        className="modal-input"
                                        placeholder="Min. 6 characters"
                                        value={newPw}
                                        onChange={e => setNewPw(e.target.value)}
                                        disabled={pwSaving}
                                    />
                                </div>
                                <div className="modal-field">
                                    <label className="modal-label">Confirm New Password</label>
                                    <input
                                        type="password"
                                        className="modal-input"
                                        placeholder="Repeat new password"
                                        value={confirmPw}
                                        onChange={e => setConfirmPw(e.target.value)}
                                        disabled={pwSaving}
                                        onKeyDown={e => e.key === 'Enter' && changePassword()}
                                    />
                                </div>

                                {pwStatus && (
                                    <p className={`modal-status ${pwStatusType}`}>{pwStatusText}</p>
                                )}

                                <button className="modal-btn" onClick={changePassword} disabled={pwSaving}>
                                    {pwSaving ? 'Saving…' : 'Update Password'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Activity Modal ── */}
            {showActivityModal && (
                <div className="modal-backdrop" onClick={() => setShowActivityModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">My Activity</h2>
                            <button className="modal-close" onClick={() => setShowActivityModal(false)}>×</button>
                        </div>
                        {activityLoading ? (
                            <div className="modal-loading"><div className="modal-spinner"></div></div>
                        ) : (
                            <div className="modal-body">
                                <div className="activity-stats-row">
                                    <div className="activity-stat-card">
                                        <div className="activity-stat-value">
                                            {formatWatchTime(activityData?.totalSeconds || 0)}
                                        </div>
                                        <div className="activity-stat-label">Total Watch Time</div>
                                    </div>
                                    <div className="activity-stat-card">
                                        <div className="activity-stat-value">
                                            {activityData?.sessions?.length || 0}
                                        </div>
                                        <div className="activity-stat-label">Sessions Logged</div>
                                    </div>
                                </div>

                                <div className="modal-divider"></div>
                                <h3 className="modal-section-title">Recent Watch Sessions</h3>

                                {(!activityData?.sessions || activityData.sessions.length === 0) ? (
                                    <p className="modal-empty">No sessions recorded yet. Start watching something!</p>
                                ) : (
                                    <div className="activity-list">
                                        {activityData.sessions.map((s, i) => (
                                            <div className="activity-item" key={i}>
                                                <div className="activity-item-name">{s.contentName || 'Unknown Title'}</div>
                                                <div className="activity-item-meta">
                                                    <span className="activity-duration">{formatWatchTime(s.duration)}</span>
                                                    <span className="activity-date">
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
