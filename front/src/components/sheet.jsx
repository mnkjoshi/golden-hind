// Bottom action sheet that animates out as well as in. useSheet() gives the
// closing flag plus close(after?): it plays the exit animation, then calls
// onClose (and `after`, for actions that open another sheet).
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useCallback, useEffect, useRef, useState } from 'react';

const EXIT_MS = 200;

export function useSheet(onClose) {
    const [closing, setClosing] = useState(false);
    const timer = useRef(null);
    const close = useCallback((after) => {
        if (timer.current) return;
        setClosing(true);
        timer.current = setTimeout(() => {
            timer.current = null;
            setClosing(false);
            onClose();
            if (typeof after === 'function') after();
        }, EXIT_MS);
    }, [onClose]);
    useEffect(() => () => clearTimeout(timer.current), []);
    // Escape closes the top-most sheet only (capture phase runs first, so the
    // full player underneath doesn't also close).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [close]);
    return { closing, close };
}

export default function Sheet({ sheet, className = '', label, role = 'dialog', children }) {
    return (
        <div className={`player-sheet-backdrop${sheet.closing ? ' closing' : ''}`} onClick={() => sheet.close()}>
            <div className={`player-sheet ${className}`} role={role} aria-label={label} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}
