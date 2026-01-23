import { useNavigate, useLocation } from "react-router-dom";
import React, { useState, useRef, useEffect } from 'react';

export default function Topbar ({ Account }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [isScrolled, setIsScrolled] = useState(false);
    const [showChristmas, setShowChristmas] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const dropdownRef = useRef(null);

    // Handle scroll effect
    useEffect(() => {
        const christmasTimer = setTimeout(() => {
            setShowChristmas(false);
        }, 30000);
        
        return () => clearTimeout(christmasTimer);
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 0);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearch = (e) => {
        if (e.key === 'Enter' && searchValue.trim()) {
            navigate('/search', {
                state: { searched: searchValue.trim() }
            });
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        navigate('/auth');
        setDropdownOpen(false);
    };

    const toggleDropdown = () => {
        setDropdownOpen(!dropdownOpen);
    };

    return (
        <nav className={`modern-topbar ${isScrolled ? 'scrolled' : ''}`}>
            <div className="topbar-content">
                {/* Logo/Brand */}
                <div className="topbar-left">
                    <button className="topbar-logo" onClick={() => navigate("/app")}>
                        <span className="logo-text">Golden Hind</span>
                        <div className={`santa-hat ${!showChristmas ? 'hidden' : ''}`}></div>
                    </button>
                </div>

                {/* Navigation Links */}
                <div className="topbar-nav">
                    <button 
                        className={`nav-link ${location.pathname === '/app' ? 'active' : ''}`}
                        onClick={() => navigate('/app')}
                    >
                        Home
                    </button>
                    <button 
                        className={`nav-link ${location.pathname === '/search' ? 'active' : ''}`}
                        onClick={() => navigate('/search')}
                    >
                        Browse
                    </button>

                    <button 
                        className={`nav-link ${location.pathname === '/books' ? 'active' : ''}`}
                        onClick={() => navigate('/books')}
                    >
                        Books
                    </button>
                </div>

                {/* Right Side */}
                <div className="topbar-right">
                    {/* Search */}
                    <div className="search-container">
                        <div className="search-wrapper">
                            <svg className="search-icon" viewBox="0 0 24 24" fill="none">
                                <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <input
                                className="search-input"
                                type="text"
                                placeholder="Search movies, TV shows..."
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onKeyDown={handleSearch}
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    {/* User Account */}
                    <div className="account-section" ref={dropdownRef}>
                        <button className="account-button" onClick={toggleDropdown}>
                            <div className="user-avatar">
                                {localStorage.getItem('user')?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <span className="username">
                                {localStorage.getItem('user') || 'Guest'}
                            </span>
                            <svg 
                                className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`} 
                                viewBox="0 0 24 24" 
                                fill="none"
                            >
                                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>

                        {dropdownOpen && (
                            <div className="account-dropdown">
                                <button className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                    <svg viewBox="0 0 24 24" fill="none">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    Account
                                </button>
                                <button className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                    <svg viewBox="0 0 24 24" fill="none">
                                        <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
    );
}

