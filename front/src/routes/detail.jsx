import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import React, { useEffect, useState, useRef } from 'react';
import Topbar from '../components/topbar';

const API = 'https://goldenhind.tech';

export default function Detail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const type = id.slice(0, 1);
    const tmdbId = id.slice(1);
    const mediaType = type === 'm' ? 'movie' : 'tv';
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [trailerKey, setTrailerKey] = useState(null);
    const [similarData, setSimilarData] = useState([]);
    const [isWatchlisted, setIsWatchlisted] = useState(false);
    const [watchlistLoading, setWatchlistLoading] = useState(false);

    const [selectedSeason, setSelectedSeason] = useState(1);
    const [seasonEpisodes, setSeasonEpisodes] = useState(null);
    const [seasonLoading, setSeasonLoading] = useState(false);

    const [resumeSeason, setResumeSeason] = useState(null);
    const [resumeEpisode, setResumeEpisode] = useState(null);

    // Read resume position from localStorage on mount
    useEffect(() => {
        const s = localStorage.getItem('season' + id);
        const e = localStorage.getItem('episode' + id);
        if (s && e) {
            setResumeSeason(parseInt(s));
            setResumeEpisode(parseInt(e));
            setSelectedSeason(parseInt(s));
        }
    }, [id]);

    // Fetch all data in parallel
    useEffect(() => {
        if (!user || !token) { navigate('/auth'); return; }
        setLoading(true);
        setDetail(null);
        setTrailerKey(null);
        setSimilarData([]);

        Promise.all([
            axios.post(`${API}/detail`, { user, token, tmdbId, mediaType }),
            axios.post(`${API}/home-trailer`, { user, token, tmdbId: parseInt(tmdbId), mediaType }),
            axios.post(`${API}/similar`, { user, token, ID: id }),
            axios.post(`${API}/home-mini`, { user, token }),
        ]).then(([detailRes, trailerRes, similarRes, miniRes]) => {
            setDetail(detailRes.data);
            if (trailerRes.data?.key) setTrailerKey(trailerRes.data.key);
            if (Array.isArray(similarRes.data)) setSimilarData(similarRes.data);
            try {
                const favs = JSON.parse(miniRes.data?.favourites || '[]');
                setIsWatchlisted(Array.isArray(favs) && favs.includes(id));
            } catch {}
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [id]);

    // Fetch season episodes whenever selected season changes
    useEffect(() => {
        if (mediaType !== 'tv' || !detail) return;
        setSeasonLoading(true);
        setSeasonEpisodes(null);
        axios.post(`${API}/season`, { user, token, seriesId: tmdbId, seasonNumber: selectedSeason })
            .then(res => { setSeasonEpisodes(res.data); setSeasonLoading(false); })
            .catch(() => setSeasonLoading(false));
    }, [selectedSeason, detail]);

    const handlePlay = () => {
        navigate(`/watch/${id}`);
        // watch.jsx reads resume position from localStorage itself
    };

    const handleEpisodePlay = (season, episode) => {
        localStorage.setItem('season' + id, season);
        localStorage.setItem('episode' + id, episode);
        navigate(`/watch/${id}`);
    };

    const handleWatchlist = async () => {
        if (watchlistLoading) return;
        setWatchlistLoading(true);
        try {
            const endpoint = isWatchlisted ? '/unfavourite' : '/favourite';
            await axios.post(`${API}${endpoint}`, { user, token, favId: id });
            setIsWatchlisted(!isWatchlisted);
        } catch {}
        setWatchlistLoading(false);
    };

    const getPlayLabel = () => {
        if (mediaType === 'tv') {
            const s = resumeSeason || 1;
            const e = resumeEpisode || 1;
            return `Play S${s} E${e}`;
        }
        return 'Play';
    };

    const getAgeRating = () => {
        if (mediaType === 'movie') {
            const us = detail?.release_dates?.results?.find(r => r.iso_3166_1 === 'US');
            return us?.release_dates?.find(rd => rd.certification)?.certification || null;
        }
        return detail?.content_ratings?.results?.find(r => r.iso_3166_1 === 'US')?.rating || null;
    };

    const getDirector = () => {
        if (mediaType === 'movie') return detail?.credits?.crew?.find(c => c.job === 'Director')?.name;
        return detail?.created_by?.map(c => c.name).join(', ') || null;
    };

    const getProducer = () => {
        if (mediaType === 'movie') return detail?.credits?.crew?.find(c => c.job === 'Producer')?.name;
        return detail?.networks?.[0]?.name || null;
    };

    const getCast = () => detail?.credits?.cast?.slice(0, 7) || [];

    const getLogo = () => {
        const logos = detail?.images?.logos;
        if (!logos?.length) return null;
        return (logos.find(l => l.iso_639_1 === 'en') || logos[0])?.file_path;
    };

    const formatRuntime = () => {
        if (mediaType === 'movie') {
            const m = detail?.runtime;
            if (!m) return null;
            return `${Math.floor(m / 60)}h ${m % 60}m`;
        }
        const s = detail?.number_of_seasons;
        const e = detail?.number_of_episodes;
        if (s && e) return `${s} Season${s > 1 ? 's' : ''} · ${e} Episodes`;
        if (s) return `${s} Season${s > 1 ? 's' : ''}`;
        return null;
    };

    const formatDate = (str) => {
        if (!str) return '';
        return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (loading) return (
        <div className="detail-loading">
            <Topbar />
            <div className="detail-loading-inner">
                <div className="detail-spinner" />
            </div>
        </div>
    );

    if (!detail) return null;

    const title = detail.title || detail.name || '';
    const overview = detail.overview || '';
    const backdrop = detail.backdrop_path;
    const year = (detail.release_date || detail.first_air_date || '').slice(0, 4);
    const rating = detail.vote_average?.toFixed(1);
    const genres = detail.genres?.slice(0, 4).map(g => g.name) || [];
    const logoPath = getLogo();
    const ageRating = getAgeRating();
    const runtime = formatRuntime();
    const director = getDirector();
    const producer = getProducer();
    const cast = getCast();
    const seasons = detail.seasons?.filter(s => s.season_number > 0) || [];

    const similarNavigate = (item) => {
        const isMovie = item.media_type === 'movie' || item.first_air_date === undefined;
        navigate(`/detail/${isMovie ? 'm' : 't'}${item.id}`);
    };

    return (
        <div className="detail-page">
            <Topbar />

            {/* ── Hero ── */}
            <div
                className="detail-hero"
                style={{ backgroundImage: backdrop ? `url(https://image.tmdb.org/t/p/original/${backdrop})` : undefined }}
            >
                <div className="detail-hero-vignette" />

                <div className="detail-hero-body">
                    {/* Left info */}
                    <div className="detail-info">
                        {logoPath ? (
                            <img
                                className="detail-logo"
                                src={`https://image.tmdb.org/t/p/w500/${logoPath}`}
                                alt={title}
                            />
                        ) : (
                            <h1 className="detail-title-text">{title}</h1>
                        )}

                        <div className="detail-tags">
                            {ageRating && <span className="detail-tag detail-tag-cert">{ageRating}</span>}
                            {year && <span className="detail-tag">{year}</span>}
                            {runtime && <span className="detail-tag">{runtime}</span>}
                            {genres.map(g => <span key={g} className="detail-tag">{g}</span>)}
                        </div>

                        <div className="detail-score">
                            <span className="detail-score-star">★</span>
                            <span className="detail-score-val">{rating}</span>
                            <span className="detail-score-denom">/10</span>
                            {detail.vote_count > 0 && (
                                <span className="detail-score-count">{detail.vote_count.toLocaleString()} votes</span>
                            )}
                        </div>

                        <p className="detail-overview">{overview}</p>

                        <div className="detail-crew-row">
                            {director && (
                                <div className="detail-crew-item">
                                    <span className="detail-crew-label">{mediaType === 'tv' ? 'Created by' : 'Director'}</span>
                                    <span className="detail-crew-value">{director}</span>
                                </div>
                            )}
                            {producer && (
                                <div className="detail-crew-item">
                                    <span className="detail-crew-label">{mediaType === 'tv' ? 'Network' : 'Producer'}</span>
                                    <span className="detail-crew-value">{producer}</span>
                                </div>
                            )}
                        </div>

                        {cast.length > 0 && (
                            <div className="detail-cast">
                                {cast.map(actor => (
                                    <div key={actor.id} className="detail-cast-item">
                                        <div className="detail-cast-photo">
                                            {actor.profile_path
                                                ? <img src={`https://image.tmdb.org/t/p/w185/${actor.profile_path}`} alt={actor.name} />
                                                : <div className="detail-cast-placeholder">{actor.name[0]}</div>
                                            }
                                        </div>
                                        <span className="detail-cast-name">{actor.name.split(' ')[0]}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="detail-actions">
                            <button className="detail-play-btn" onClick={handlePlay}>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                                {getPlayLabel()}
                            </button>
                            <button
                                className={`detail-watchlist-btn${isWatchlisted ? ' active' : ''}`}
                                onClick={handleWatchlist}
                                disabled={watchlistLoading}
                            >
                                {isWatchlisted ? (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                                        In My List
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                                        My List
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Trailer / backdrop panel */}
                    <div className="detail-trailer-panel">
                        <div className="detail-trailer-fade" />
                        {trailerKey ? (
                            <iframe
                                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&controls=0&loop=1&playlist=${trailerKey}&mute=1`}
                                allow="autoplay; encrypted-media"
                                title="Trailer"
                            />
                        ) : backdrop ? (
                            <img
                                className="detail-trailer-fallback"
                                src={`https://image.tmdb.org/t/p/w1280/${backdrop}`}
                                alt=""
                            />
                        ) : null}
                    </div>
                </div>
            </div>

            {/* ── Episodes (TV only) ── */}
            {mediaType === 'tv' && seasons.length > 0 && (
                <div className="detail-episodes-section">
                    <div className="detail-season-bar">
                        <h2 className="detail-section-heading">Episodes</h2>
                        <div className="detail-season-tabs">
                            {seasons.map(s => (
                                <button
                                    key={s.season_number}
                                    className={`detail-season-tab${selectedSeason === s.season_number ? ' active' : ''}`}
                                    onClick={() => setSelectedSeason(s.season_number)}
                                >
                                    Season {s.season_number}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="detail-episode-list">
                        {seasonLoading
                            ? [...Array(5)].map((_, i) => <div key={i} className="detail-episode-skeleton" />)
                            : seasonEpisodes?.episodes?.map(ep => (
                                <div
                                    key={ep.episode_number}
                                    className="detail-episode-row"
                                    onClick={() => handleEpisodePlay(selectedSeason, ep.episode_number)}
                                >
                                    <div className="detail-episode-thumb">
                                        {ep.still_path
                                            ? <img src={`https://image.tmdb.org/t/p/w300/${ep.still_path}`} alt="" />
                                            : <div className="detail-episode-no-thumb" />
                                        }
                                        <div className="detail-episode-play-icon">▶</div>
                                    </div>
                                    <div className="detail-episode-info">
                                        <div className="detail-episode-header">
                                            <span className="detail-episode-num">E{ep.episode_number}</span>
                                            <span className="detail-episode-title">{ep.name}</span>
                                            <div className="detail-episode-meta">
                                                {ep.runtime ? <span>{ep.runtime} min</span> : null}
                                                {ep.air_date ? <span>{formatDate(ep.air_date)}</span> : null}
                                                {ep.vote_average > 0 ? <span>★ {ep.vote_average.toFixed(1)}</span> : null}
                                            </div>
                                        </div>
                                        {ep.overview && <p className="detail-episode-overview">{ep.overview}</p>}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            )}

            {/* ── Similar ── */}
            {similarData.length > 0 && (
                <div className="detail-similar-section">
                    <h2 className="detail-section-heading">Similar</h2>
                    <div className="detail-similar-row">
                        {similarData.filter(item => item.poster_path).map(item => (
                            <div
                                key={item.id}
                                className="detail-similar-card"
                                onClick={() => similarNavigate(item)}
                            >
                                <img
                                    src={`https://image.tmdb.org/t/p/w300/${item.poster_path}`}
                                    alt={item.title || item.name}
                                />
                                <div className="detail-similar-overlay">
                                    <span className="detail-similar-name">{item.title || item.name}</span>
                                    {item.vote_average > 0 && (
                                        <span className="detail-similar-rating">★ {item.vote_average.toFixed(1)}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="detail-footer-pad" />
        </div>
    );
}
