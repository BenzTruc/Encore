import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';

/** Floating Liquid Glass sheet: bottom sheet on phones, centered panel on larger screens. */
export function Sheet({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div
            ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`sheet glass ${wide ? 'wide' : ''}`} style={{ outline: 'none' }}
            initial={{ y: 60, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 40, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="sheet-head"><h2>{title}</h2><button className="icon-btn plain" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
            <div className="sheet-body">{children}</div>
            {footer && <div className="sheet-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** In-page confirmation (the app never uses window.confirm). */
export function Confirm({ open, title, text, ok = 'Continue', danger, onAnswer }: { open: boolean; title: string; text: ReactNode; ok?: string; danger?: boolean; onAnswer: (yes: boolean) => void }) {
  return (
    <Sheet open={open} title={title} onClose={() => onAnswer(false)} footer={<><button className="btn plain" onClick={() => onAnswer(false)}>Cancel</button><button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => onAnswer(true)}>{ok}</button></>}>
      <p className="muted">{text}</p>
    </Sheet>
  );
}
