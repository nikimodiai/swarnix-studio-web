import React, { useEffect, useRef, useState } from 'react';
import styles from './InfoDot.module.css';

// Small "i" info icon that shows a floating tooltip with both English and
// Hindi text stacked together — used next to every option label across the
// Studio Suite features so jewellers who read Hindi aren't stuck with
// English-only explanations. Hover on desktop, tap on touch (auto-closes).
export default function InfoDot({ text, textHi }) {
  const isTouch = useRef(typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches).current;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { left, top, place }
  const closeTimer = useRef(null);
  const ref = useRef(null);

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const above = rect.top > 170;
    const tw = 240;
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    setPos({ left, top: above ? rect.top - 8 : rect.bottom + 8, place: above ? 'above' : 'below' });
  };

  const show = () => { place(); setOpen(true); };
  const hide = () => setOpen(false);

  const onClickTouch = (e) => {
    e.stopPropagation();
    show();
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(hide, 4000);
  };

  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
  }, [open]);

  if (!text) return null;

  return (
    <>
      <span
        ref={ref}
        className={styles.dot}
        role="button"
        aria-label="Help"
        {...(isTouch ? { onClick: onClickTouch } : { onMouseEnter: show, onMouseLeave: hide })}
      >
        i
      </span>
      {open && pos && (
        <div
          className={`${styles.tip} ${styles[pos.place]}`}
          style={{ left: pos.left, top: pos.top, transform: pos.place === 'above' ? 'translateY(-100%)' : 'none' }}
        >
          <p className={styles.en}>{text}</p>
          {textHi && <p className={styles.hi}>{textHi}</p>}
        </div>
      )}
    </>
  );
}
