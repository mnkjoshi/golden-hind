// A button that asks first: tapping it opens a small "are you sure" pop-up
// beside it, and onConfirm only runs from the pop-up's confirm button. The
// pop-up is portalled with fixed positioning so list rows can't clip it.
// eslint flags React as unused, but JSX here compiles with the classic runtime.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmButton({ className, onConfirm, message, confirmLabel = 'Remove', children, ...rest }) {
    const [pos, setPos] = useState(null); // where the open pop-up sits
    const btn = useRef(null);
    const pop = useRef(null);

    useEffect(() => {
        if (!pos) return;
        const close = () => setPos(null);
        const onDown = (e) => {
            if (pop.current?.contains(e.target) || btn.current?.contains(e.target)) return;
            close();
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [pos]);

    const toggle = (e) => {
        e.stopPropagation();
        if (pos) return setPos(null);
        const r = btn.current.getBoundingClientRect();
        // Under the button near the top of the screen, otherwise above it.
        const below = r.top < 170;
        setPos({
            right: Math.max(8, window.innerWidth - r.right),
            ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }),
        });
    };

    return (
        <>
            <button ref={btn} className={`${className}${pos ? ' confirming' : ''}`} onClick={toggle} aria-expanded={!!pos} {...rest}>{children}</button>
            {pos && createPortal(
                <div ref={pop} className="confirm-pop" style={pos} role="alertdialog" aria-label={message} onClick={e => e.stopPropagation()}>
                    <span className="confirm-pop-msg">{message}</span>
                    <span className="confirm-pop-actions">
                        <button className="confirm-pop-cancel" onClick={() => setPos(null)}>Cancel</button>
                        <button className="confirm-pop-ok" autoFocus onClick={() => { setPos(null); onConfirm(); }}>{confirmLabel}</button>
                    </span>
                </div>,
                document.body,
            )}
        </>
    );
}
