import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import Topbar from '../components/topbar';

const API = 'https://goldenhind.tech';

export default function Collection() {
    const { id } = useParams();
    const navigate = useNavigate();
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    const [collection, setCollection] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { navigate('/auth'); return; }
        document.title = 'The Golden Hind';
        setLoading(true);
        setCollection(null);
        axios.post(`${API}/collection`, { user, token, collectionId: id })
            .then(r => setCollection(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    const parts = (collection?.parts || [])
        .filter(p => p.poster_path)
        .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));

    if (loading) {
        return (
            <div className="person-page">
                <Topbar />
                <div className="person-loading"><div className="person-spinner"/></div>
            </div>
        );
    }

    if (!collection) {
        return (
            <div className="person-page">
                <Topbar />
                <div className="person-empty">Collection not found.</div>
            </div>
        );
    }

    return (
        <div className="person-page">
            <Topbar />
            <div className="person-content">
                <div className="collection-banner">
                    {collection.backdrop_path && (
                        <img className="collection-backdrop" src={`https://image.tmdb.org/t/p/original/${collection.backdrop_path}`} alt="" />
                    )}
                    <div className="collection-banner-scrim" />
                    <div className="collection-banner-info">
                        <h1 className="person-name">{collection.name}</h1>
                        {collection.overview && <p className="collection-overview">{collection.overview}</p>}
                        <p className="collection-count">{parts.length} {parts.length === 1 ? 'title' : 'titles'}</p>
                    </div>
                </div>

                <div className="person-section">
                    <div className="person-grid">
                        {parts.map(part => (
                            <div
                                key={part.id}
                                className="person-credit"
                                onClick={() => navigate(`/detail/m${part.id}`)}
                            >
                                <img
                                    className="person-credit-poster"
                                    src={`https://image.tmdb.org/t/p/w300/${part.poster_path}`}
                                    loading="lazy"
                                    decoding="async"
                                    alt=""
                                />
                                <div className="person-credit-meta">
                                    <span className="person-credit-title">{part.title || part.name}</span>
                                    <span className="person-credit-year">{(part.release_date || '').slice(0, 4) || '—'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
