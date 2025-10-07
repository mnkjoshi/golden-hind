import { Outlet, useNavigate, useLocation } from "react-router-dom";
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar.jsx"

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

// Helper function to convert genre IDs to names
const getGenreNames = (genreIds) => {
    if (!genreIds || !Array.isArray(genreIds)) return "Unknown";
    return genreIds.map(id => genreMap[id] || "Unknown").filter(name => name !== "Unknown").join(", ") || "Unknown";
};

export default function App() {  
    let location = useLocation();
    const navigate = useNavigate();

    
    const [bookmarkData, setBookmarkData] = useState(null)
    const [continueData, setContinueData] = useState(null)
    const [trendingData, setTrendingData] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [heroIndex, setHeroIndex] = useState(0)
    const [tooltip, setTooltip] = useState({ visible: false, data: null, x: 0, y: 0 })



    let user = localStorage.getItem("user")
    let token = localStorage.getItem("token")

    useEffect(() => {
        document.title = "The Golden Hind"
        if (user == null) {
            navigate('/auth')
        } else {
            if (bookmarkData === null && continueData === null && trendingData === null) {
                setIsLoading(true)
                axios({
                    method: 'post',
                    url: 'https://golden-hind.onrender.com/home',
                    data: {
                        user: user,
                        token: token,
                    }
                }).then((response) => {
                    localStorage.setItem("bookmarks", response.data.favourites)
                    localStorage.setItem("continues", response.data.continues)
                    // Filter out null values from arrays
                    const validBookmarks = (response.data.favouritesData || []).filter(item => item && item.id)
                    const validContinues = (response.data.continuesData || []).filter(item => item && item.id)
                    setBookmarkData(validBookmarks.reverse())
                    setContinueData(validContinues.reverse())
                    setTrendingData(response.data.trendingData)
                    setIsLoading(false)
                }).catch((error) => {
                    console.error('Failed to load data:', error)
                    setIsLoading(false)
                });
            }
        }
    }, [])

    // Auto-rotate hero slider
    useEffect(() => {
        if (trendingData && trendingData.results && trendingData.results.length > 0) {
            const interval = setInterval(() => {
                setHeroIndex(prev => (prev + 1) % Math.min(5, trendingData.results.length))
            }, 5000)
            return () => clearInterval(interval)
        }
    }, [trendingData])

    // Add drag-to-scroll functionality
    useEffect(() => {
        const contentRows = document.querySelectorAll('.content-row');
        
        contentRows.forEach(row => {
            let isDown = false;
            let startX;
            let scrollLeft;
            let hasMoved = false;
            const dragThreshold = 5; // Minimum pixels to move before considering it a drag

            const handleMouseDown = (e) => {
                // Only start drag if clicking on the row itself, not on cards
                if (e.target.closest('.content-card')) return;
                
                isDown = true;
                hasMoved = false;
                startX = e.pageX - row.offsetLeft;
                scrollLeft = row.scrollLeft;
                row.style.cursor = 'grabbing';
            };

            const handleMouseLeave = () => {
                isDown = false;
                hasMoved = false;
                row.classList.remove('dragging');
                row.style.cursor = 'grab';
            };

            const handleMouseUp = (e) => {
                isDown = false;
                row.classList.remove('dragging');
                row.style.cursor = 'grab';
                
                // If we haven't moved much, allow click events to propagate
                if (!hasMoved) {
                    return;
                }
            };

            const handleMouseMove = (e) => {
                if (!isDown) return;
                
                const x = e.pageX - row.offsetLeft;
                const deltaX = Math.abs(x - startX);
                
                // Only start dragging if we've moved beyond threshold
                if (deltaX > dragThreshold) {
                    hasMoved = true;
                    row.classList.add('dragging');
                    e.preventDefault();
                    const walk = (x - startX);
                    row.scrollLeft = scrollLeft - walk;
                }
            };

            row.addEventListener('mousedown', handleMouseDown);
            row.addEventListener('mouseleave', handleMouseLeave);
            row.addEventListener('mouseup', handleMouseUp);
            row.addEventListener('mousemove', handleMouseMove);

            // Cleanup
            return () => {
                row.removeEventListener('mousedown', handleMouseDown);
                row.removeEventListener('mouseleave', handleMouseLeave);
                row.removeEventListener('mouseup', handleMouseUp);
                row.removeEventListener('mousemove', handleMouseMove);
            };
        });
    }, [continueData, bookmarkData, trendingData])

    // Tooltip functions
    const showTooltip = (event, data) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipWidth = 300;
        const tooltipHeight = 280;
        const margin = 20;
        
        let x = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let y = rect.top - tooltipHeight - margin;
        
        // Keep within viewport
        if (x < margin) x = margin;
        if (x + tooltipWidth > window.innerWidth - margin) {
            x = window.innerWidth - tooltipWidth - margin;
        }
        if (y < margin) y = rect.bottom + margin;
        
        setTooltip({ visible: true, data, x, y });
    };
    
    const hideTooltip = () => {
        setTooltip({ visible: false, data: null, x: 0, y: 0 });
    };

    function removeHandle(isMovie, ID, isBookmark) {
        // Send request to backend but don't wait for response
        axios({
            method: 'post',
            url: 'https://golden-hind.onrender.com/' + (isBookmark == true ? "unfavourite" : "uncontinue"),
            data: {
                user: user,
                token: token,
                favId: (isMovie == true ? "m" : "t") + ID,
            }
        }).catch((error) => {
            console.error('Failed to remove item from backend:', error);
            // Optionally show a toast notification here
        });

        // Remove item locally without forcing re-render
        if (isBookmark) {
            setBookmarkData(prevData => prevData.filter(item => item.id !== ID));
        } else {
            setContinueData(prevData => prevData.filter(item => item.id !== ID));
        }
    }

    return (
        <div className="app-main" id="app-main">
            <Topbar/>
            
            {/* Loading Indicator */}
            {isLoading && (
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">Loading your content...</p>
                </div>
            )}
            
            {/* Main Content - Only show when not loading */}
            {!isLoading && (
                <>
                    {/* Hero Section */}
                    {trendingData && trendingData.results && trendingData.results.length > 0 && (
                <div className="hero-section">
                    <div className="hero-backdrop">
                        <img 
                            className="hero-image" 
                            src={`https://image.tmdb.org/t/p/w1280/${trendingData.results[heroIndex].backdrop_path}`}
                            alt="Hero backdrop"
                            loading="eager"
                            decoding="async"
                        />
                        <div className="hero-gradient"></div>
                    </div>
                    
                    <div className="hero-content">
                        <div className="hero-info">
                            <h1 className="hero-title">
                                {trendingData.results[heroIndex].name || trendingData.results[heroIndex].title || "Untitled"}
                            </h1>
                            <p className="hero-overview">
                                {trendingData.results[heroIndex].overview}
                            </p>
                            <div className="hero-meta">
                                <span className="hero-rating">
                                    ⭐ {trendingData.results[heroIndex].vote_average}/10
                                </span>
                                <span className="hero-year">
                                    {(() => {
                                        const date = trendingData.results[heroIndex].release_date || trendingData.results[heroIndex].first_air_date;
                                        return date ? new Date(date).getFullYear() : 'N/A';
                                    })()}
                                </span>
                                <span className="hero-type">
                                    {trendingData.results[heroIndex].media_type === "movie" ? "Movie" : "TV Series"}
                                </span>
                            </div>
                            <div className="hero-buttons">
                                <button 
                                    className="hero-play-btn"
                                    onClick={() => {
                                        if (trendingData.results[heroIndex].media_type === "movie") {
                                            navigate("/watch/m" + trendingData.results[heroIndex].id)
                                        } else {
                                            navigate("/watch/t" + trendingData.results[heroIndex].id)
                                        }
                                    }}
                                >
                                    ▶ Play
                                </button>
                                <button className="hero-info-btn">
                                    ℹ More Info
                                </button>
                            </div>
                        </div>
                        
                        <div className="hero-indicators">
                            {trendingData && trendingData.results && trendingData.results.slice(0, 5).map((_, index) => (
                                <div 
                                    key={index}
                                    className={`hero-indicator ${index === heroIndex ? 'active' : ''}`}
                                    onClick={() => setHeroIndex(index)}
                                ></div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Content Sections */}
            <div className="content-sections">
                {/* Continue Watching Section */}
                {continueData && continueData.length > 0 && (
                    <div className="content-section">
                        <div className="section-header">
                            <h2 className="section-title">Continue Watching</h2>
                            <div className="section-controls">
                                <button 
                                    className="section-arrow" 
                                    onClick={() => {
                                        const container = document.getElementById('continue-row');
                                        container.scrollBy({ left: -300, behavior: 'smooth' });
                                    }}
                                >
                                    ‹
                                </button>
                                <button 
                                    className="section-arrow" 
                                    onClick={() => {
                                        const container = document.getElementById('continue-row');
                                        container.scrollBy({ left: 300, behavior: 'smooth' });
                                    }}
                                >
                                    ›
                                </button>
                            </div>
                        </div>
                        <div className="content-row" id="continue-row">
                            {continueData && continueData.filter(result => result && result.id).map(result => (
                                <div 
                                    key={result.id} 
                                    className="content-card"
                                    onClick={() => {
                                        if (result.number_of_episodes == null) {
                                            navigate("/watch/m" + result.id)
                                        } else {
                                            navigate("/watch/t" + result.id)
                                        }
                                    }}
                                    onMouseEnter={(e) => showTooltip(e, result)}
                                    onMouseLeave={hideTooltip}
                                >
                                    <div className="card-image-container">
                                        <img 
                                            className="card-image" 
                                            src={`https://image.tmdb.org/t/p/w300/${result.poster_path}`}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                        <div className="card-overlay">
                                            <div className="card-info">
                                                <h3 className="card-title">{result.name || result.title || "Untitled"}</h3>
                                                <div className="card-meta">
                                                    <span className="card-rating">⭐ {result.vote_average}</span>
                                                    <span className="card-type">{result.number_of_episodes ? "TV" : "Movie"}</span>
                                                </div>
                                            </div>
                                            <button 
                                                className="card-remove-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeHandle(result.number_of_episodes == null, result.id, false);
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bookmarked Section */}
                {bookmarkData && bookmarkData.length > 0 && (
                    <div className="content-section">
                        <div className="section-header">
                            <h2 className="section-title">My List</h2>
                            <div className="section-controls">
                                <button 
                                    className="section-arrow" 
                                    onClick={() => {
                                        const container = document.getElementById('bookmark-row');
                                        container.scrollBy({ left: -300, behavior: 'smooth' });
                                    }}
                                >
                                    ‹
                                </button>
                                <button 
                                    className="section-arrow" 
                                    onClick={() => {
                                        const container = document.getElementById('bookmark-row');
                                        container.scrollBy({ left: 300, behavior: 'smooth' });
                                    }}
                                >
                                    ›
                                </button>
                            </div>
                        </div>
                        <div className="content-row" id="bookmark-row">
                            {bookmarkData && bookmarkData.filter(result => result && result.id).map(result => (
                                <div 
                                    key={result.id} 
                                    className="content-card"
                                    onClick={() => {
                                        if (result.number_of_episodes == null) {
                                            navigate("/watch/m" + result.id)
                                        } else {
                                            navigate("/watch/t" + result.id)
                                        }
                                    }}
                                    onMouseEnter={(e) => showTooltip(e, result)}
                                    onMouseLeave={hideTooltip}
                                >
                                    <div className="card-image-container">
                                        <img 
                                            className="card-image" 
                                            src={`https://image.tmdb.org/t/p/w300/${result.poster_path}`}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                        <div className="card-overlay">
                                            <div className="card-info">
                                                <h3 className="card-title">{result.name || result.title || "Untitled"}</h3>
                                                <div className="card-meta">
                                                    <span className="card-rating">⭐ {result.vote_average}</span>
                                                    <span className="card-type">{result.number_of_episodes ? "TV" : "Movie"}</span>
                                                </div>
                                            </div>
                                            <button 
                                                className="card-remove-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeHandle(result.number_of_episodes == null, result.id, true);
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Trending Section */}
                {trendingData && trendingData.results && (
                    <div className="content-section">
                        <div className="section-header">
                            <h2 className="section-title">Trending Now</h2>
                            <div className="section-controls">
                                <button 
                                    className="section-arrow" 
                                    onClick={() => {
                                        const container = document.getElementById('trending-row');
                                        container.scrollBy({ left: -300, behavior: 'smooth' });
                                    }}
                                >
                                    ‹
                                </button>
                                <button 
                                    className="section-arrow" 
                                    onClick={() => {
                                        const container = document.getElementById('trending-row');
                                        container.scrollBy({ left: 300, behavior: 'smooth' });
                                    }}
                                >
                                    ›
                                </button>
                            </div>
                        </div>
                        <div className="content-row" id="trending-row">
                            {trendingData && trendingData.results && trendingData.results.filter(result => result && result.id).map(result => (
                                <div 
                                    key={result.id} 
                                    className="content-card"
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
                                    <div className="card-image-container">
                                        <img 
                                            className="card-image" 
                                            src={`https://image.tmdb.org/t/p/w300/${result.poster_path}`}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                        <div className="card-overlay">
                                            <div className="card-info">
                                                <h3 className="card-title">{result.name || result.title || "Untitled"}</h3>
                                                <div className="card-meta">
                                                    <span className="card-rating">⭐ {result.vote_average}</span>
                                                    <span className="card-type">{result.media_type === "movie" ? "Movie" : "TV"}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
                </>
            )}
            
            {/* External Tooltip Component */}
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
                            {tooltip.data.media_type === "movie" || tooltip.data.number_of_episodes == null ? "Movie" : "TV Series"}
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
                            <span>Genres: {getGenreNames(tooltip.data.genre_ids.slice(0, 3))}</span>
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