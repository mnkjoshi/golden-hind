// Seek bar driven by pointer events instead of <input type="range">: the
// whole 28px-tall strip is grabbable, a tap anywhere jumps there (iOS range
// inputs only move by dragging their tiny thumb), and dragging keeps tracking
// outside the bar thanks to pointer capture.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useRef, useState } from 'react';

export default function Scrubber({ value, max, onScrub, onCommit, disabled = false, className = '', label = 'Seek' }) {
    const ref = useRef(null);
    const active = useRef(false);
    const [drag, setDrag] = useState(null); // 0–1 while the finger/mouse is down
    const frac = drag ?? (max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);

    const fracAt = (e) => {
        const r = ref.current.getBoundingClientRect();
        return r.width ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0;
    };
    const onPointerDown = (e) => {
        if (disabled || e.button > 0) return;
        e.preventDefault();
        ref.current.setPointerCapture?.(e.pointerId);
        active.current = true;
        const f = fracAt(e);
        setDrag(f);
        onScrub?.(f * max);
    };
    const onPointerMove = (e) => {
        if (!active.current) return;
        const f = fracAt(e);
        setDrag(f);
        onScrub?.(f * max);
    };
    const onPointerUp = (e) => {
        if (!active.current) return;
        active.current = false;
        const f = fracAt(e);
        setDrag(null);
        onCommit(f * max);
    };
    const onPointerCancel = () => {
        active.current = false;
        setDrag(null);
        onScrub?.(null);
    };
    const onKeyDown = (e) => {
        if (disabled) return;
        const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
        if (step) onCommit(Math.min(max, Math.max(0, value + step)));
        else if (e.key === 'Home') onCommit(0);
        else if (e.key === 'End') onCommit(max);
        else return;
        e.preventDefault();
    };

    return (
        <div
            ref={ref}
            className={`scrubber ${className}${drag !== null ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
            style={{ '--pct': `${frac * 100}%` }}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.round(max || 0)}
            aria-valuenow={Math.round(value || 0)}
            aria-disabled={disabled}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onKeyDown={onKeyDown}
        >
            <div className="scrubber-track"><div className="scrubber-fill" /></div>
            <div className="scrubber-thumb" />
        </div>
    );
}
