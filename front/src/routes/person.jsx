import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import Topbar from '../components/topbar';

const API = 'https://goldenhind.tech';

export default function Person() {
    const { id } = useParams();
    const navigate = useNavigate();
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    const [person, setPerson] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bioExpanded, setBioExpanded] = useState(false);

    useEffect(() => {
        if (!user) { navigate('/auth'); return; }
        document.title = 'The Golden Hind';
        setLoading(true);
        setPerson(null);
        axios.post(`${API}/person`, { user, token, personId: id })
            .then(r => setPerson(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    const openCredit = (credit) => {
        const prefix = credit.media_type === 'tv' ? 't' : 'm';
        navigate(`/detail/${prefix}${credit.id}`);
    };

    // Combined cast + crew, de-duped on (id, media_type), top-N most recent
    // by release date. Crew gets a job label so directors/writers don't blur in.
    const filmography = (() => {
        if (!person?.combined_credits) return [];
        const cast = (person.combined_credits.cast || []).map(c => ({ ...c, role: c.character || '' }));
        const crew = (person.combined_credits.crew || []).map(c => ({ ...c, role: c.job || '' }));
        const merged = new Map();
        [...cast, ...crew].forEach(item => {
            if (!item.poster_path) return;
            const key = `${item.media_type}-${item.id}`;
            const existing = merged.get(key);
            if (!existing || (item.role && !existing.role)) merged.set(key, item);
        });
        return Array.from(merged.values()).sort((a, b) => {
            const da = a.release_date || a.first_air_date || '';
            const db = b.release_date || b.first_air_date || '';
            return db.localeCompare(da);
        });
    })();

    if (loading) {
        return (
            <div className="person-page">
                <Topbar />
                <div className="person-loading"><div className="person-spinner"/></div>
            </div>
        );
    }

    if (!person) {
        return (
            <div className="person-page">
                <Topbar />
                <div className="person-empty">Person not found.</div>
            </div>
        );
    }

    return (
        <div className="person-page">
            <Topbar />
            <div className="person-content">
                <div className="person-header">
                    {person.profile_path ? (
                        <img className="person-photo" src={`https://image.tmdb.org/t/p/w500/${person.profile_path}`} alt={person.name} />
                    ) : (
                        <div className="person-photo person-photo-placeholder">?</div>
                    )}
                    <div className="person-meta">
                        <h1 className="person-name">{person.name}</h1>
                        {person.known_for_department && (
                            <p className="person-known-for">{person.known_for_department}</p>
                        )}
                        <div className="person-facts">
                            {person.birthday && (
                                <span className="person-fact">
                                    Born {new Date(person.birthday).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                    {person.place_of_birth ? ` · ${person.place_of_birth}` : ''}
                                </span>
                            )}
                            {person.deathday && (
                                <span className="person-fact">
                                    Died {new Date(person.deathday).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                </span>
                            )}
                        </div>
                        {person.biography && (
                            <div className={`person-bio${bioExpanded ? ' expanded' : ''}`}>
                                <p>{person.biography}</p>
                                {person.biography.length > 400 && (
                                    <button className="person-bio-toggle" onClick={() => setBioExpanded(v => !v)}>
                                        {bioExpanded ? 'Show less' : 'Read more'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="person-section">
                    <h2 className="person-section-title">Known For</h2>
                    <div className="person-grid">
                        {filmography.map(credit => (
                            <div
                                key={`${credit.media_type}-${credit.id}-${credit.credit_id || credit.role}`}
                                className="person-credit"
                                onClick={() => openCredit(credit)}
                            >
                                <img
                                    className="person-credit-poster"
                                    src={`https://image.tmdb.org/t/p/w300/${credit.poster_path}`}
                                    loading="lazy"
                                    decoding="async"
                                    alt=""
                                />
                                <div className="person-credit-meta">
                                    <span className="person-credit-title">{credit.title || credit.name}</span>
                                    {credit.role && <span className="person-credit-role">{credit.role}</span>}
                                    <span className="person-credit-year">
                                        {(credit.release_date || credit.first_air_date || '').slice(0, 4) || '—'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
