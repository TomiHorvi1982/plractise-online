import { useState, useRef, useCallback } from 'react';
import FloatingPanel from './FloatingPanel';

interface LyricsPanelProps {
  id: string;
  zIndex: number;
  visible: boolean;
  onClose: () => void;
  onFocus: () => void;
  text: string;
  onChange: (v: string) => void;
}

const LYRIC_SITES = [
  { name: 'karaoke-texty.cz', url: 'https://www.karaoke-texty.cz' },
  { name: 'Genius', url: 'https://genius.com' },
  { name: 'AZLyrics', url: 'https://www.azlyrics.com' },
];

export default function LyricsPanel({ id, zIndex, visible, onClose, onFocus, text, onChange }: LyricsPanelProps) {
  const [fontSize, setFontSize] = useState(16);
  const [textColor, setTextColor] = useState('#e8e8f0');
  const [bgColor, setBgColor] = useState('#1a1a3e');

  return (
    <FloatingPanel
      id={id}
      title="Lyrics"
      initialX={100}
      initialY={80}
      initialWidth={400}
      initialHeight={450}
      zIndex={zIndex}
      visible={visible}
      onClose={onClose}
      onFocus={onFocus}
    >
      <div className="lp-toolbar">
        <label className="lp-label">
          Size
          <input type="range" min={10} max={36} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mini-slider" />
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
        <span className="lp-label">Load from:</span>
        {LYRIC_SITES.map((site) => (
          <a key={site.name} href={site.url} target="_blank" rel="noopener noreferrer" className="lp-site-btn" title={`Open ${site.name}`}>
            {site.name}
          </a>
        ))}
      </div>
      <textarea
        className="lp-textarea"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste lyrics here, or open one of the sites above, copy, and paste..."
        style={{ fontSize, color: textColor, backgroundColor: bgColor, fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}
      />
    </FloatingPanel>
  );
}
