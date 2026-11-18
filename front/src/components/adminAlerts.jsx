// Pop-up notices for the admin: new kinds of errors, sign-up attempts,
// settings changes and new music power users (written server-side to
// admin/alerts). Mounted from the Topbar, so it runs on every page; only the
// admin account polls. What's been shown is remembered per browser, so a
// notice appears once even with several tabs open.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'https://ghb.mnkjoshi.ca';
const ADMIN_USER = 'manav';
const POLL_MS = 45000;
const SHOW_MS = 10000;
const SEEN_KEY = 'adminAlertsSeen';
// First run on a browser: catch up on the last day, not all history.
const FIRST_LOOKBACK_MS = 24 * 3600 * 1000;

export const ALERT_LABELS = {
    error: 'New error',
    signup: 'Sign-up',
    settings: 'Settings',
    power_user: 'Power user',
};
const ICONS = { error: '⚠️', signup: '👤', settings: '⚙️', power_user: '🎧' };

const readSeen = () => {
    try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
};
const writeSeen = (ts) => {
    try { if (ts > readSeen()) localStorage.setItem(SEEN_KEY, String(ts)); } catch { /* noop */ }
};

export default function AdminAlerts() {
    const navigate = useNavigate();
    const [toasts, setToasts] = useState([]);   // [{ id, type, user, message, leaving }]
    const timers = useRef(new Map());
    const isAdmin = localStorage.getItem('user') === ADMIN_USER;

    const dismiss = (id) => {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        setToasts(list => list.map(t => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 220);
    };

    useEffect(() => {
        if (!isAdmin) return;
        const token = localStorage.getItem('token');
        let stopped = false;
        const poll = async () => {
            if (document.visibilityState !== 'visible') return;
            const since = readSeen() || Date.now() - FIRST_LOOKBACK_MS;
            try {
                const r = await axios.post(`${API}/admin/alerts`, { user: ADMIN_USER, token, since });
                const fresh = (r.data?.alerts || []).filter(a => a.timestamp > readSeen());
                if (stopped || !fresh.length) return;
                writeSeen(Math.max(...fresh.map(a => a.timestamp)));
                setToasts(list => [...list, ...fresh].slice(-4));
                for (const a of fresh) timers.current.set(a.id, setTimeout(() => dismiss(a.id), SHOW_MS));
            } catch { /* offline or signed out: try again next time */ }
        };
        poll();
        const iv = setInterval(poll, POLL_MS);
        document.addEventListener('visibilitychange', poll);
        const pending = timers.current;
        return () => {
            stopped = true;
            clearInterval(iv);
            document.removeEventListener('visibilitychange', poll);
            pending.forEach(clearTimeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!isAdmin || !toasts.length) return null;
    return (
        <div className="admin-alerts" role="status" aria-live="polite">
            {toasts.map(t => (
                <div key={t.id} className={`admin-alert admin-alert-${t.type}${t.leaving ? ' leaving' : ''}`}>
                    <button className="admin-alert-body" onClick={() => { dismiss(t.id); navigate('/admin'); }}>
                        <span className="admin-alert-icon" aria-hidden="true">{ICONS[t.type] || '🔔'}</span>
                        <span className="admin-alert-text">
                            <span className="admin-alert-type">{ALERT_LABELS[t.type] || t.type}</span>
                            <span className="admin-alert-message">{t.message}</span>
                        </span>
                    </button>
                    <button className="admin-alert-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
                </div>
            ))}
        </div>
    );
}
