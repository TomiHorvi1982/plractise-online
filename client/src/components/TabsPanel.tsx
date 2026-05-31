import { useState } from 'react';
import FloatingPanel from './FloatingPanel';

interface TabsPanelProps {
  id: string;
  zIndex: number;
  visible: boolean;
  onClose: () => void;
  onFocus: () => void;
  text: string;
  onChange: (v: string) => void;
}

export default function TabsPanel({ id, zIndex, visible, onClose, onFocus, text, onChange }: TabsPanelProps) {
  const [fontSize, setFontSize] = useState(14);
  const [textColor, setTextColor] = useState('#e8e8f0');
  const [bgColor, setBgColor] = useState('#0a0a14');

  return (
    <FloatingPanel
      id={id}
      title="Guitar Tabs"
      initialX={100}
      initialY={540}
      initialWidth={500}
      initialHeight={400}
      zIndex={zIndex}
      visible={visible}
      onClose={onClose}
      onFocus={onFocus}
    >
      <div className="lp-toolbar">
        <label className="lp-label">
          Size
          <input type="range" min={8} max={30} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mini-slider" />
          <span className="mini-val">{fontSize}px</span>
        </label>
        <label className="lp-label">
          Text
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="lp-color" />
        </label>
        <label className="lp-label">
          Bg
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="lp-color" />
        </label>
      </div>
      <div className="lp-site-links">
        <span className="lp-label">Get tabs:</span>
        <a href="https://www.ultimate-guitar.com" target="_blank" rel="noopener noreferrer" className="lp-site-btn">
          Ultimate Guitar
        </a>
      </div>
      <textarea
        className="lp-textarea tabs-textarea"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste guitar tablature here. Copy from Ultimate Guitar, paste, and customize..."
        style={{
          fontSize, color: textColor, backgroundColor: bgColor,
          fontFamily: 'var(--font-mono)', lineHeight: 1.5,
          whiteSpace: 'pre', tabSize: 2,
        }}
        spellCheck={false}
      />
    </FloatingPanel>
  );
}
