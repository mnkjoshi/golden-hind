// Profile pictures. <UserAvatar> shows a user's uploaded picture, falling back
// to the Golden Hind wheel. Your own picture's version is remembered (per
// user) in localStorage and refreshed once per session from /account/info,
// so a picture changed on another device shows up here too.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useState, useSyncExternalStore } from 'react';
import axios from 'axios';
import { squareCrop, avatarUrl } from '../utils/avatar.js';

const API = 'https://ghb.mnkjoshi.ca';
const KEY = 'avatarVersion';
const auth = () => ({ user: localStorage.getItem('user'), token: localStorage.getItem('token') });

// ── Your own picture's version ──────────────────────────────────────────────
const listeners = new Set();
function readMine() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        return saved && saved.user === localStorage.getItem('user') ? Number(saved.v) || 0 : 0;
    } catch { return 0; }
}
function setMine(v) {
    try { localStorage.setItem(KEY, JSON.stringify({ user: localStorage.getItem('user'), v: v || 0 })); } catch { /* quota */ }
    listeners.forEach(fn => fn());
}
export function useMyAvatarVersion() {
    return useSyncExternalStore(
        (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        readMine,
    );
}

let checkedFor = null;
export async function refreshMyAvatar() {
    const { user, token } = auth();
    if (!user || !token || checkedFor === user) return;
    checkedFor = user;
    try {
        const r = await axios.post(`${API}/account/info`, { user, token });
        if (r.status === 200 && r.data && typeof r.data === 'object') setMine(r.data.avatar || 0);
    } catch { checkedFor = null; }
}

// ── Upload / remove ─────────────────────────────────────────────────────────
// Centre-crop to a 256px square JPEG in the browser, so uploads are tiny
// (and phone photos' size or format never reach the server).
export async function makeAvatarDataUrl(file, size = 256) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("That file isn't a picture we can open."));
            i.src = url;
        });
        const { sx, sy, side } = squareCrop(img.naturalWidth, img.naturalHeight);
        if (!side) throw new Error("That picture looks empty.");
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        for (const quality of [0.88, 0.75, 0.6, 0.45]) {
            const data = canvas.toDataURL('image/jpeg', quality);
            if (data.length < 90000) return data;
        }
        throw new Error('That picture is too detailed to shrink — try another.');
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function uploadAvatar(file) {
    const image = await makeAvatarDataUrl(file);
    const r = await axios.post(`${API}/account/avatar`, { ...auth(), image });
    setMine(r.data.avatar);
}

export async function removeAvatar() {
    await axios.post(`${API}/account/avatar/delete`, auth());
    setMine(0);
}

// ── Display ─────────────────────────────────────────────────────────────────
// Users known to have no picture this session, so lists don't re-request.
const missing = new Set();

// version: a number for a known picture, 0 for "known to have none",
// undefined for "don't know" (other users — tried once, then the wheel).
export default function UserAvatar({ user, version, className = '' }) {
    const [failedUrl, setFailedUrl] = useState(null);
    const url = user && version !== 0 && !(version === undefined && missing.has(user))
        ? avatarUrl(API, user, version) : null;
    const photo = url && failedUrl !== url;
    return (
        <div className={`user-avatar${photo ? ' has-photo' : ''} ${className}`}>
            {photo ? (
                <img
                    src={url}
                    alt=""
                    onError={() => { if (version === undefined) missing.add(user); setFailedUrl(url); }}
                />
            ) : (
                <img src="/icon-512.png" alt="" />
            )}
        </div>
    );
}

// Account Settings: your picture with "Change photo" / "Remove".
export function AvatarEditor() {
    const user = localStorage.getItem('user');
    const version = useMyAvatarVersion();
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(null); // { ok, text }

    const pick = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';   // picking the same file again still fires
        if (!file || busy) return;
        setBusy(true);
        setStatus(null);
        try {
            await uploadAvatar(file);
            setStatus({ ok: true, text: 'Photo updated' });
        } catch (err) {
            setStatus({ ok: false, text: err.response?.data?.error || err.message || 'Upload failed' });
        }
        setBusy(false);
    };
    const remove = async () => {
        if (busy) return;
        setBusy(true);
        setStatus(null);
        try {
            await removeAvatar();
            setStatus({ ok: true, text: 'Photo removed' });
        } catch {
            setStatus({ ok: false, text: 'Could not remove the photo' });
        }
        setBusy(false);
    };

    return (
        <div className="avatar-editor">
            <UserAvatar user={user} version={version} className="avatar-editor-pic" />
            <div className="avatar-editor-side">
                <div className="avatar-editor-actions">
                    <label className={`avatar-editor-btn${busy ? ' disabled' : ''}`}>
                        {busy ? 'Working…' : version ? 'Change photo' : 'Upload photo'}
                        <input type="file" accept="image/*" onChange={pick} disabled={busy} hidden />
                    </label>
                    {version > 0 && (
                        <button className="avatar-editor-btn secondary" onClick={remove} disabled={busy}>Remove</button>
                    )}
                </div>
                <span className={`avatar-editor-status${status ? (status.ok ? ' ok' : ' err') : ''}`}>
                    {status ? status.text : 'Square crop from the centre. Shows next to your name.'}
                </span>
            </div>
        </div>
    );
}
