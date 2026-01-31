import { useNavigate, useLocation } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import Topbar from "../components/topbar"

// TMDB Genre mapping
const genreMap = {
    // Movie genres
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 
    878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    // TV genres
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

export default function Search() {  
    const navigate = useNavigate();
    const [results, setResults] = useState([]);
    const [currentSearch, setCurrentSearch] = useState("");
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [tooltip, setTooltip] = useState({ visible: false, data: null, x: 0, y: 0 });
    const { state } = useLocation();
    const searched = state?.searched || "";
    
    const itemsPerPage = window.innerWidth < 800 ? 6 : 20;
    const user = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    useEffect(() => {
        if (!user) {
            navigate('/auth');
            return;
        }
        Authenticate(user, token, navigate);
        
        if (searched && searched !== currentSearch) {
            setLoading(true);
            axios({
                method: 'post',
                url: 'https://goldenhind.tech/search',
                data: { query: searched }
            }).then((response) => {
                setCurrentSearch(searched);
                setPage(0);
                setResults(response.data || []);
                setLoading(false);
            }).catch(() => {
                setLoading(false);
            });
        }
    }, [searched, currentSearch, user, token, navigate]);
    
    const showTooltip = (event, data) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipWidth = 300;
        const tooltipHeight = 280;
        const margin = 20;
        
        let x = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let y = rect.top - tooltipHeight - margin;
        
        // Keep within viewport horizontally
        if (x < margin) x = margin;
        if (x + tooltipWidth > window.innerWidth - margin) {
            x = window.innerWidth - tooltipWidth - margin;
        }
        
        // Original behavior: if tooltip goes above viewport, show below card
        if (y < margin) y = rect.bottom + margin;
        
        // New: prevent tooltip from going below viewport
        const viewportHeight = window.innerHeight;
        if (y + tooltipHeight > viewportHeight - margin) {
            y = viewportHeight - tooltipHeight - margin;
        }
        
        setTooltip({ visible: true, data, x, y });
    };
    
    const hideTooltip = () => {
        setTooltip({ visible: false, data: null, x: 0, y: 0 });
    };
    
    const totalPages = Math.ceil(results.length / itemsPerPage);
    const currentResults = results.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
    
    const getGenreNames = (genreIds) => {
        if (!genreIds || !Array.isArray(genreIds)) return [];
        return genreIds.map(id => genreMap[id] || `Genre ${id}`).filter(Boolean);
    };

    return (
        <div className="modern-search-page">
            <Topbar/>
            
            <div className="search-content">
                {/* Search Header */}
                <div className="search-header">
                    <div className="search-info">
                        <h1 className="search-title">
                            {searched ? `Results for "${searched}"` : 'Search Results'}
                        </h1>
                        <p className="search-subtitle">
                            {loading ? 'Searching...' : `${results.length} ${results.length === 1 ? 'result' : 'results'} found`}
                        </p>
                    </div>
                    
                    {/* Pagination */}
                    {results.length > itemsPerPage && (
                        <div className="search-pagination">
                            <button 
                                className="pagination-btn"
                                onClick={() => setPage(page - 1)}
                                disabled={page === 0}
                            >
                                <svg viewBox="0 0 24 24" fill="none">
                                    <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                            <span className="pagination-info">
                                Page {page + 1} of {totalPages}
                            </span>
                            <button 
                                className="pagination-btn"
                                onClick={() => setPage(page + 1)}
                                disabled={page >= totalPages - 1}
                            >
                                <svg viewBox="0 0 24 24" fill="none">
                                    <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* Search Results */}
                <div className="search-results-grid">
                    {loading ? (
                        <div className="search-loading">
                            <div className="loading-spinner"></div>
                            <p>Searching for amazing content...</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="search-empty">
                            <svg viewBox="0 0 24 24" fill="none">
                                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                                <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <h3>No results found</h3>
                            <p>Try searching for something else</p>
                        </div>
                    ) : (
                        currentResults.map((result) => (
                            <div 
                                key={result.id}
                                className="search-result-card"
                                onClick={() => {
                                    if (result.media_type === "movie") {
                                        navigate("/watch/m" + result.id)
                                    } else {
                                        navigate("/watch/t" + result.id)
                                    }
                                }}
                                onMouseEnter={(e) => showTooltip(e, result)}
                                onMouseLeave={hideTooltip}
                            >
                                <div className="card-poster-container">
                                    <img 
                                        className="card-poster" 
                                        src={`https://image.tmdb.org/t/p/w300/${result.poster_path}`}
                                        alt={result.name || result.title || "Untitled"}
                                        loading="lazy"
                                    />
                                    <div className="card-overlay">
                                        <div className="card-play-btn">
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M8 5v14l11-7z"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="card-content">
                                    <h3 className="card-title">
                                        {result.name || result.title || "Untitled"}
                                    </h3>
                                    
                                    <div className="card-meta">
                                        <span className={`card-type-${result.media_type === 'movie' ? 'movie' : 'tv'}`}>
                                            {result.media_type === 'movie' ? 'Movie' : 'TV'}
                                        </span>
                                        <span className="card-rating">
                                            ⭐ {result.vote_average?.toFixed(1) || 'N/A'}
                                        </span>
                                        <span className="card-year">
                                            {result.release_date ? new Date(result.release_date).getFullYear() : 
                                             result.first_air_date ? new Date(result.first_air_date).getFullYear() : 'N/A'}
                                        </span>
                                    </div>
                                    
                                    <p className="card-overview">
                                        {result.overview ? 
                                            (result.overview.length > 120 ? 
                                                result.overview.substring(0, 120) + '...' : 
                                                result.overview
                                            ) : 
                                            'No description available.'
                                        }
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            {/* External Tooltip */}
            {tooltip.visible && tooltip.data && (
                <div 
                    className="external-tooltip"
                    style={{
                        left: tooltip.x + 'px',
                        top: tooltip.y + 'px'
                    }}
                >
                    <div className="tooltip-header">
                        <h4 className="tooltip-title">{tooltip.data.name || tooltip.data.title || "Untitled"}</h4>
                        <div className="tooltip-rating">⭐ {tooltip.data.vote_average}/10</div>
                    </div>
                    <div className="tooltip-meta">
                        <span className="tooltip-type">
                            {tooltip.data.media_type === "movie" ? "Movie" : "TV Series"}
                        </span>
                        <span className="tooltip-date">
                            {tooltip.data.release_date ? new Date(tooltip.data.release_date).getFullYear() : 
                             tooltip.data.first_air_date ? new Date(tooltip.data.first_air_date).getFullYear() : 'N/A'}
                        </span>
                        <span className="tooltip-language">{tooltip.data.original_language?.toUpperCase()}</span>
                    </div>
                    <p className="tooltip-overview">
                        {tooltip.data.overview || "No description available."}
                    </p>
                    {tooltip.data.genre_ids && tooltip.data.genre_ids.length > 0 && (
                        <div className="tooltip-genres">
                            <span>Genres: {getGenreNames(tooltip.data.genre_ids).slice(0, 3).join(", ")}</span>
                        </div>
                    )}
                    {tooltip.data.popularity && (
                        <div className="tooltip-popularity">
                            <span>Popularity: {Math.round(tooltip.data.popularity)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}