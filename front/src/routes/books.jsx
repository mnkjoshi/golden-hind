import { useNavigate, useLocation } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import axios from 'axios'
import Authenticate  from "../components/authenticate.jsx";
import Topbar from "../components/topbar.jsx"
import '../stylesheets/books.css'


export default function Books() {  
    const navigate = useNavigate();
    const [results, setResults] = useState([]);
    const [currentSearch, setCurrentSearch] = useState("");
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const { state } = useLocation();
    const searched = state?.searched || "";
    
    const itemsPerPage = window.innerWidth < 800 ? 6 : 12;
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
                method: 'get',
                url: `https://goldenhind.tech/book-search?q=${encodeURIComponent(searched)}`
            }).then((response) => {
                setCurrentSearch(searched);
                setPage(0);
                setResults(response.data.results || []);
                setLoading(false);
            }).catch((err) => {
                console.error('Search error:', err);
                setLoading(false);
            });
        }
    }, [searched, currentSearch, user, token, navigate]);
    
    const totalPages = Math.ceil(results.length / itemsPerPage);
    const currentResults = results.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

    return (
        <div className="modern-search-page">
            <Topbar/>
            
            <div className="search-content">
                {/* Search Header */}
                <div className="search-header">
                    <div className="search-info">
                        <h1 className="search-title">
                            {searched ? `Book Results for "${searched}"` : 'Book Search'}
                        </h1>
                        <p className="search-subtitle">
                            {loading ? 'Searching LibGen...' : `${results.length} ${results.length === 1 ? 'book' : 'books'} found`}
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
                            <p>Searching LibGen for books...</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="search-empty">
                            <svg viewBox="0 0 24 24" fill="none">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <h3>No books found</h3>
                            <p>Try searching for a different title or author</p>
                        </div>
                    ) : (
                        currentResults.map((book, index) => (
                            <div 
                                key={index}
                                className="book-result-card"
                            >
                                <div className="book-card-header">
                                    <h3 className="book-title">{book.author}</h3>
                                    <span className={`book-format ${book.extension}`}>{book.extension?.toUpperCase()}</span>
                                </div>
                                
                                <div className="book-details">
                                    <div className="book-detail-row">
                                        <span className="book-label">Title:</span>
                                        <span className="book-value">{book.title || 'Unknown'}</span>
                                    </div>
                                    
                                    {book.publisher && (
                                        <div className="book-detail-row">
                                            <span className="book-label">Publisher:</span>
                                            <span className="book-value">{book.publisher}</span>
                                        </div>
                                    )}
                                    
                                    <div className="book-meta-row">
                                        {book.year && <span className="book-badge">📅 {book.year}</span>}
                                        {book.language && <span className="book-badge">🌐 {book.language}</span>}
                                        {book.pages && <span className="book-badge">📄 {book.pages} pages</span>}
                                        {book.size && <span className="book-badge">💾 {book.size}</span>}
                                    </div>
                                </div>
                                
                                {book.downloadLink && (
                                    <a 
                                        href={book.downloadLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="book-download-btn"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Download
                                    </a>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}