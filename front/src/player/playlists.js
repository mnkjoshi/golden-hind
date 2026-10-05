// Playlists store, shared by the Library page, the playlist page, and the
// "Add to playlist" picker (which any song row or the player can open).
import axios from 'axios';
import { useSyncExternalStore } from 'react';

const API = 'https://ghb.mnkjoshi.ca';
const auth = () => ({ user: localStorage.getItem('user'), token: localStorage.getItem('token') });

let state = {
    playlists: (() => { try { return JSON.parse(localStorage.getItem('playlistsCache') || 'null'); } catch { return null; } })(),
    pickerSong: null, // song the "Add to playlist" sheet is open for
};
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
const save = (playlists) => {
    set({ playlists });
    try { localStorage.setItem('playlistsCache', JSON.stringify(playlists)); } catch { /* quota */ }
};

export async function refreshPlaylists() {
    try {
        const r = await axios.post(`${API}/music/playlists`, auth());
        save(r.data?.playlists || []);
    } catch { /* offline: keep the cached copy */ }
}

export async function createPlaylist(name, songs = []) {
    const r = await axios.post(`${API}/music/playlists/create`, { ...auth(), name, songs });
    await refreshPlaylists();
    return r.data.id;
}

export async function updatePlaylist(id, patch) {
    save((state.playlists || []).map(p => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));
    try { await axios.post(`${API}/music/playlists/update`, { ...auth(), id, ...patch }); }
    finally { refreshPlaylists(); }
}

export async function deletePlaylist(id) {
    save((state.playlists || []).filter(p => p.id !== id));
    try { await axios.post(`${API}/music/playlists/delete`, { ...auth(), id }); }
    finally { refreshPlaylists(); }
}

// Adding to a playlist also puts the song in the library, so it has the
// metadata (title/artist) every list shows.
export async function addToPlaylist(id, song) {
    const p = (state.playlists || []).find(x => x.id === id);
    if (!p || p.songs.includes(song.videoId)) return;
    axios.post(`${API}/music/library/add`, { ...auth(), song: { videoId: song.videoId, title: song.title, artist: song.artist || song.channel } }).catch(() => {});
    await updatePlaylist(id, { songs: [...p.songs, song.videoId] });
}

export const openPlaylistPicker = (song) => set({ pickerSong: song });
export const closePlaylistPicker = () => set({ pickerSong: null });

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function usePlaylists() {
    return useSyncExternalStore(subscribe, () => state);
}
