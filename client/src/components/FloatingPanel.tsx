import { useRef, useState, useCallback, useEffect } from 'react';

interface FloatingPanelProps {
  id: string;
  title: string;
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;
  zIndex: number;
  visible: boolean;
  onClose: () => void;
  onFocus: () => void;
  children: React.ReactNode;
}

export default function FloatingPanel({
  title, initialX = 100, initialY = 80,
  initialWidth = 360, initialHeight = 400,
  zIndex, visible, onClose, onFocus, children,
}: FloatingPanelProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startL: 0, startT: 0 });
  const resizeRef = useRef({ startX: 0, startY: 0, startW: 0, startH: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    onFocus();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startL: pos.x, startT: pos.y };
    setDragging(true);
  }, [pos, onFocus]);

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    setResizing(true);
  }, [size, onFocus]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPos({ x: Math.max(0, dragRef.current.startL + dx), y: Math.max(0, dragRef.current.startT + dy) });
      }
      if (resizing) {
        const dw = e.clientX - resizeRef.current.startX;
        const dh = e.clientY - resizeRef.current.startY;
        setSize({ w: Math.max(200, resizeRef.current.startW + dw), h: Math.max(200, resizeRef.current.startH + dh) });
      }
    };
    const onUp = () => { setDragging(false); setResizing(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [dragging, resizing]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className={`floating-panel ${dragging ? 'dragging' : ''}`}
      style={{
        left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        zIndex, position: 'fixed',
      }}
      role="dialog"
      aria-label={title}
    >
      <div
        className="fp-header"
        onPointerDown={handlePointerDown}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <span className="fp-title">{title}</span>
        <div className="fp-actions">
          <button className="fp-btn" onClick={onFocus} aria-label="Bring to front" title="Bring to front">^</button>
          <button className="fp-btn fp-close" onClick={onClose} aria-label="Close panel">✕</button>
        </div>
      </div>
      <div className="fp-body">
        {children}
      </div>
      <div className="fp-resize-handle" onPointerDown={handleResizeDown} aria-label="Resize" />
    </div>
  );
}
