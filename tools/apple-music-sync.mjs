#!/usr/bin/env node
// Copy My Songs into the Mac's Music app, in a "Golden Hind" playlist, so the
// usual Mac → iPhone sync (Finder, or Sync Library) puts them on the phone.
// iOS doesn't expose a folder for Apple Music's local songs, so the Mac's
// Music library is the way in.
//
//   GH_USER=you GH_PASSWORD=... node tools/apple-music-sync.mjs [--dry-run] [--playlist "Golden Hind"]
//
// Songs already in the Music library (matched by title + artist) aren't
// downloaded again — they're just added to the playlist. New ones are saved
// to ~/Music/Golden Hind/ and imported. Safe to re-run any time.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = process.env.GH_API || 'https://ghb.mnkjoshi.ca';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PLAYLIST = args.includes('--playlist') ? args[args.indexOf('--playlist') + 1] : 'Golden Hind';
const FOLDER = path.join(os.homedir(), 'Music', 'Golden Hind');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function jxa(script) {
    return execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

async function login() {
    if (process.env.GH_TOKEN) return { user: process.env.GH_USER, token: process.env.GH_TOKEN };
    const res = await fetch(`${API}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: process.env.GH_USER, password: process.env.GH_PASSWORD }),
    });
    const body = await res.json().catch(() => null);
    if (!body?.token) throw new Error('Login failed — check GH_USER / GH_PASSWORD');
    return { user: process.env.GH_USER, token: body.token };
}

async function main() {
    if (!process.env.GH_USER) throw new Error('Set GH_USER and GH_PASSWORD (or GH_TOKEN)');
    const { user, token } = await login();
    const lib = await fetch(`${API}/music/library`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, token }),
    }).then(r => r.json());
    const songs = lib.songs || [];
    console.log(`My Songs: ${songs.length}`);

    // Everything currently in the Music library, plus the playlist's contents.
    const music = JSON.parse(jxa(`
        const app = Application('Music');
        const lib = app.libraryPlaylists[0];
        const pl = app.userPlaylists.whose({ name: ${JSON.stringify(PLAYLIST)} });
        JSON.stringify({
            names: lib.tracks.name(),
            artists: lib.tracks.artist(),
            ids: lib.tracks.persistentID(),
            inPlaylist: pl.length ? pl[0].tracks.persistentID() : [],
        });
    `));
    const inPlaylist = new Set(music.inPlaylist);
    const tracks = music.names.map((name, i) => ({ name: norm(name), artist: norm(music.artists[i]), id: music.ids[i] }));
    console.log(`Music library: ${tracks.length} tracks; "${PLAYLIST}" playlist: ${inPlaylist.size}`);

    const findTrack = (s) => {
        const t = norm(s.title), a = norm(s.artist);
        if (!t) return null;
        return tracks.find(x => (x.name === t || x.name.includes(t) || (a && x.name === a + t))
            && (!a || x.artist.includes(a) || a.includes(x.artist) || x.name.includes(a))) || null;
    };

    const existing = [], missing = [];
    for (const s of songs) {
        const match = findTrack(s);
        if (match) existing.push({ s, match }); else missing.push(s);
    }
    const toLink = existing.filter(e => !inPlaylist.has(e.match.id));
    console.log(`Already in Music: ${existing.length} (${toLink.length} to add to the playlist) · New to download: ${missing.length}`);
    if (DRY_RUN) {
        for (const s of missing) console.log(`  + ${s.artist ? s.artist + ' - ' : ''}${s.title}`);
        console.log('Dry run — nothing changed.');
        return;
    }

    fs.mkdirSync(FOLDER, { recursive: true });
    const files = [];
    for (const [i, s] of missing.entries()) {
        const res = await fetch(`${API}/music/stream/${s.videoId}?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}&download=1`);
        if (!res.ok) { console.log(`  ✗ ${s.title} (HTTP ${res.status})`); continue; }
        const cd = res.headers.get('content-disposition') || '';
        const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || `${s.title}.mp3`);
        const file = path.join(FOLDER, name.replace(/[/\\:]/g, '-'));
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        files.push(file);
        console.log(`  ↓ ${i + 1}/${missing.length} ${name}`);
    }

    // Import new files and link existing tracks into the playlist.
    const result = jxa(`
        const app = Application('Music');
        let pl = app.userPlaylists.whose({ name: ${JSON.stringify(PLAYLIST)} });
        pl = pl.length ? pl[0] : app.make({ new: 'userPlaylist', withProperties: { name: ${JSON.stringify(PLAYLIST)} } });
        const files = ${JSON.stringify(files)};
        if (files.length) app.add(files.map(f => Path(f)), { to: pl });
        const link = ${JSON.stringify(toLink.map(e => e.match.id))};
        for (const pid of link) {
            const t = app.libraryPlaylists[0].tracks.whose({ persistentID: pid });
            if (t.length) app.duplicate(t[0], { to: pl });
        }
        String(pl.tracks.length);
    `);
    console.log(`Done. Imported ${files.length} new song(s); "${PLAYLIST}" now has ${result} tracks.`);
    console.log('Next: sync your iPhone (Finder → iPhone → Music → include this playlist), or let Sync Library pick it up.');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
