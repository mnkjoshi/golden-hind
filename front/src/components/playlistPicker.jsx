// "Add to playlist" sheet. Mounted once (from the Topbar); opened from any
// song via openPlaylistPicker(song), or for a selection via openPlaylistPicker([songs]).
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useState } from 'react';
import { usePlaylists, refreshPlaylists, addToPlaylist, createPlaylist, closePlaylistPicker } from '../player/playlists.js';
import CoverArt from './coverArt.jsx';
import Sheet, { useSheet } from './sheet.jsx';

export default function PlaylistPicker() {
    const { playlists, pickerSong } = usePlaylists();
    const songs = pickerSong ? [].concat(pickerSong) : [];
    // Keyed by the songs so each opening starts fresh (name field, "Added" state).
    return songs.length
        ? <PickerSheet key={songs.map(s => s.videoId).join(',')} songs={songs} playlists={playlists} />
        : null;
}

function PickerSheet({ songs, playlists }) {
    const song = songs[0];
    const many = songs.length > 1;
    const sheet = useSheet(closePlaylistPicker);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);

    useEffect(() => { refreshPlaylists(); }, []);

    const add = async (p) => {
        if (busy) return;
        setBusy(true);
        try { await addToPlaylist(p.id, songs); setDone(p.name); setTimeout(() => sheet.close(), 700); }
        finally { setBusy(false); }
    };
    const create = async () => {
        const n = name.trim();
        if (!n || busy) return;
        setBusy(true);
        try {
            await createPlaylist(n, [...new Set(songs.map(s => s.videoId))]);
            setDone(n);
            setTimeout(() => sheet.close(), 700);
        } finally { setBusy(false); }
    };

    return (
        <Sheet sheet={sheet} className="pl-picker" label="Add to playlist">
            <div className="player-sheet-head">
                <CoverArt className="player-sheet-cover" videoId={song.videoId} />
                <span className="player-meta">
                    <span className="player-title">Add to playlist</span>
                    <span className="player-artist">{many ? `${songs.length} songs` : song.title}</span>
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
                            const has = songs.every(x => p.songs.includes(x.videoId));
                            return (
                                <button key={p.id} onClick={() => add(p)} disabled={has || busy}>
                                    <span>{p.name}</span>
                                    <span className="pl-picker-meta">{has ? (many ? 'All already added' : 'Already added') : `${p.songs.length} songs`}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
            <button className="player-sheet-cancel" onClick={() => sheet.close()}>Cancel</button>
        </Sheet>
    );
}
