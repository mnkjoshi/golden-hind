// "Add to playlist" sheet. Mounted once (from the Topbar); opened from any
// song via openPlaylistPicker(song).
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useState } from 'react';
import { usePlaylists, refreshPlaylists, addToPlaylist, createPlaylist, closePlaylistPicker } from '../player/playlists.js';
import CoverArt from './coverArt.jsx';

export default function PlaylistPicker() {
    const { playlists, pickerSong: song } = usePlaylists();
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);

    useEffect(() => {
        if (!song) return;
        refreshPlaylists();
        setNaming(false); setName(''); setDone(null);
    }, [song?.videoId]);

    if (!song) return null;

    const add = async (p) => {
        if (busy) return;
        setBusy(true);
        try { await addToPlaylist(p.id, song); setDone(p.name); setTimeout(closePlaylistPicker, 700); }
        finally { setBusy(false); }
    };
    const create = async () => {
        const n = name.trim();
        if (!n || busy) return;
        setBusy(true);
        try {
            await createPlaylist(n, [song.videoId]);
            setDone(n);
            setTimeout(closePlaylistPicker, 700);
        } finally { setBusy(false); }
    };

    return (
        <div className="player-sheet-backdrop" onClick={closePlaylistPicker}>
            <div className="player-sheet pl-picker" role="dialog" aria-label="Add to playlist" onClick={e => e.stopPropagation()}>
                <div className="player-sheet-head">
                    <CoverArt className="player-sheet-cover" videoId={song.videoId} />
                    <span className="player-meta">
                        <span className="player-title">Add to playlist</span>
                        <span className="player-artist">{song.title}</span>
                    </span>
                </div>
                {done ? (
                    <div className="pl-done">Added to {done}</div>
                ) : (
                    <>
                        {naming ? (
                            <div className="pl-new">
                                <input
                                    autoFocus
                                    value={name}
                                    maxLength={60}
                                    placeholder="Playlist name"
                                    onChange={e => setName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && create()}
                                />
                                <button onClick={create} disabled={!name.trim() || busy}>Create</button>
                            </div>
                        ) : (
                            <button className="pl-new-btn" onClick={() => setNaming(true)}>+ New playlist</button>
                        )}
                        <div className="pl-picker-list">
                            {(playlists || []).map(p => {
                                const has = p.songs.includes(song.videoId);
                                return (
                                    <button key={p.id} onClick={() => add(p)} disabled={has || busy}>
                                        <span>{p.name}</span>
                                        <span className="pl-picker-meta">{has ? 'Already added' : `${p.songs.length} songs`}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
                <button className="player-sheet-cancel" onClick={closePlaylistPicker}>Cancel</button>
            </div>
        </div>
    );
}
