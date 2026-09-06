// Pure helpers for the remote-control feature (unit tested). The stateful
// side (SSE, localStorage, command dispatch) lives in components/remote.jsx.

// Best-guess default name for this device, editable by the user before
// exposing it. TV mode is the strongest signal — it exists specifically for
// televisions — then the user agent.
export function defaultDeviceName(userAgent = '', tvMode = false) {
    const ua = String(userAgent).toLowerCase();
    if (tvMode || /smart-tv|smarttv|googletv|apple tv|crkey|roku|tizen|web0s|webos/.test(ua)) return 'TV';
    if (/ipad|tablet/.test(ua)) return 'Tablet';
    if (/iphone|android.*mobile|mobile.*android/.test(ua)) return 'Phone';
    if (/android/.test(ua)) return 'Tablet';
    if (/macintosh|mac os/.test(ua)) return 'Mac';
    if (/windows/.test(ua)) return 'PC';
    return 'Device';
}

// One-line description of what a player device is doing, for device lists.
// state is the object the player reports to /remote/state.
export function formatRemoteState(state) {
    if (!state || !state.contentId) return 'Idle';
    const parts = [state.title || 'Unknown title'];
    if (state.contentId[0] === 't' && state.season && state.episode) {
        parts.push(`S${state.season} E${state.episode}`);
    }
    parts.push(state.paused ? 'Paused' : 'Playing');
    return parts.join(' · ');
}

// Seconds → "0:07" / "12:34" / "1:02:05" for the remote's seek readout.
// (formatWatchTime rounds to minutes, too coarse for a transport bar.)
export function formatClock(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Live position estimate between 5s state reports: advance the reported
// position by the time elapsed since it arrived, clamped to duration.
export function estimatePosition(state, receivedAt, now) {
    if (!state || typeof state.position !== 'number') return 0;
    if (state.paused) return state.position;
    const elapsed = Math.max(0, (now - receivedAt) / 1000);
    const pos = state.position + elapsed;
    return typeof state.duration === 'number' && state.duration > 0
        ? Math.min(pos, state.duration)
        : pos;
}
