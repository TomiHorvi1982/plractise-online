import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { TrackConfig, SongConfig, SessionData } from '../types';
import { saveAudioBuffer, loadAudioBuffer, deleteAudioBuffer } from '../utils/indexedDB';

interface TrackMixerProps {
  socket: Socket;
  externalLyrics?: string;
  onExternalLyricsChange?: (v: string) => void;
  externalTabs?: string;
  onExternalTabsChange?: (v: string) => void;
}

const TRACK_COLORS = [
  '#6c5ce7', '#e74c3c', '#2ecc71', '#f39c12',
  '#3498db', '#e84393', '#00cec9', '#fd79a8',
];

function makeDefaultTracks(): TrackConfig[] {
  return [
    { id: 'drums', name: 'Drums', type: 'drums', color: TRACK_COLORS[0], volume: 0, pan: 0, pitch: 0, muted: false, solo: false, recording: false, playing: false, height: 200 },
    { id: 'bass', name: 'Bass', type: 'bass', color: TRACK_COLORS[1], volume: 0, pan: 0, pitch: 0, muted: false, solo: false, recording: false, playing: false, height: 200 },
    { id: 'vocals', name: 'Vocals', type: 'vocals', color: TRACK_COLORS[2], volume: 0, pan: 0, pitch: 0, muted: false, solo: false, recording: false, playing: false, height: 200 },
    { id: 'guitar', name: 'Guitar', type: 'guitar', color: TRACK_COLORS[3], volume: 0, pan: 0, pitch: 0, muted: false, solo: false, recording: false, playing: false, height: 200 },
  ];
}

const DEFAULT_SONG: SongConfig = {
  id: 'song-1', name: 'Song 1', tempo: 120,
  tracks: makeDefaultTracks(), loopA: null, loopB: null, lyrics: '', tabs: '',
};

const STORAGE_KEY = 'jamstream-session';

function loadLocalSession(): SessionData | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function saveLocalSession(data: SessionData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export default function TrackMixer({
  socket,
  externalLyrics, onExternalLyricsChange,
  externalTabs, onExternalTabsChange,
}: TrackMixerProps) {
  const [songs, setSongs] = useState<SongConfig[]>(() => {
    const saved = loadLocalSession();
    if (saved && saved.songs.length > 0) {
      return saved.songs.map((sd) => ({
        ...sd, tracks: sd.tracks.map((td) => ({
          ...td, recording: false, playing: false,
          buffer: undefined, sourceNode: null, gainNode: undefined, pannerNode: undefined,
        })),
      }));
    }
    return [DEFAULT_SONG];
  });
  const [currentSongIdx, setCurrentSongIdx] = useState(() => {
    const saved = loadLocalSession();
    return saved ? saved.currentSongIndex : 0;
  });

  const song = songs[currentSongIdx] || songs[0];

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tempo, setTempoState] = useState(song.tempo);
  const [position, setPosition] = useState(0);
  const [tracks, setTracks] = useState<TrackConfig[]>(song.tracks);
  const [loopA, setLoopA] = useState<number | null>(song.loopA);
  const [loopB, setLoopB] = useState<number | null>(song.loopB);
  const [looping, setLooping] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [renamingTrack, setRenamingTrack] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const positionRef = useRef(0);
  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const rafRef = useRef<number>();
  const startTimeRef = useRef(0);
  const startPosRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recorderTimerRef = useRef<number>();

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.gain.value = 0.7;
      masterGainRef.current.connect(audioCtxRef.current.destination);
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    const s = songs[currentSongIdx] || songs[0];
    setTracks(s.tracks);
    setTempoState(s.tempo);
    setLoopA(s.loopA);
    setLoopB(s.loopB);
    setPlaying(false); setPaused(false); setPosition(0);
    positionRef.current = 0;
    if (onExternalLyricsChange) onExternalLyricsChange(s.lyrics);
    if (onExternalTabsChange) onExternalTabsChange(s.tabs);

    // Load audio buffers from IndexedDB for this song's tracks
    const ctx = getAudioCtx();
    s.tracks.forEach((track) => {
      loadAudioBuffer(s.id, track.id).then((record) => {
        if (!record) return;
        ctx.decodeAudioData(record.data.slice(0)).then((audioBuffer) => {
          setTracks((prev) => prev.map((t) =>
            t.id === track.id ? { ...t, buffer: audioBuffer, audioFileName: record.name, audioFileType: record.type } : t
          ));
        }).catch(() => {});
      }).catch(() => {});
    });
  }, [currentSongIdx]);

  useEffect(() => { setTempoState(song.tempo); }, [song.tempo]);

  // Transport position loop
  useEffect(() => {
    playingRef.current = playing;
    pausedRef.current = paused;
    positionRef.current = position;
    if (playing && !paused) {
      startTimeRef.current = performance.now();
      startPosRef.current = position;
      const update = () => {
        if (!playingRef.current || pausedRef.current) return;
        const elapsed = performance.now() - startTimeRef.current;
        let pos = startPosRef.current + elapsed;
        if (loopA !== null && loopB !== null && looping && pos >= loopB) {
          pos = loopA;
          startPosRef.current = loopA;
          startTimeRef.current = performance.now();
          restartAudioTracksAt(loopA);
        }
        setPosition(pos);
        rafRef.current = requestAnimationFrame(update);
      };
      rafRef.current = requestAnimationFrame(update);
      return () => cancelAnimationFrame(rafRef.current!);
    }
  }, [playing, paused, loopA, loopB, looping]);

  const restartAudioTracksAt = (pos: number) => {
    tracks.forEach((t) => { if (t.buffer && t.gainNode && t.pannerNode) { stopTrackNode(t); startTrackNode(t, pos); } });
  };

  const stopTrackNode = (track: TrackConfig) => {
    try { track.sourceNode?.stop(); } catch {}
    track.sourceNode = null;
  };

  const startTrackNode = (track: TrackConfig, offset: number) => {
    if (!track.buffer || !audioCtxRef.current || !masterGainRef.current) return;
    const ctx = audioCtxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.detune.value = track.pitch * 100;
    const gain = ctx.createGain();
    gain.gain.value = dbToLinear(track.volume);
    const panner = ctx.createStereoPanner();
    panner.pan.value = track.pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(masterGainRef.current);
    const startOffset = Math.min(offset / 1000, track.buffer.duration - 0.01);
    source.start(0, startOffset);
    track.sourceNode = source;
    track.gainNode = gain;
    track.pannerNode = panner;
  };

  const dbToLinear = (db: number) => Math.pow(10, db / 20);

  const syncSocket = (data: any) => { socket.emit('backing-track-command', data); };

  const togglePlay = () => {
    if (playing && !paused) {
      setPaused(true); pausedRef.current = true;
      tracks.forEach((t) => stopTrackNode(t));
      syncSocket({ action: 'pause', position: positionRef.current });
    } else if (paused) {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      setPaused(false); pausedRef.current = false;
      tracks.forEach((t) => { if (t.buffer) startTrackNode(t, positionRef.current / 1000); });
      syncSocket({ action: 'resume', position: positionRef.current, tempo });
    } else {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      setPosition(0); setPlaying(true); setPaused(false);
      positionRef.current = 0; startPosRef.current = 0;
      tracks.forEach((t) => { if (t.buffer) startTrackNode(t, 0); });
      syncSocket({ action: 'play', tempo });
    }
  };

  const stopPlayback = () => {
    setPlaying(false); setPaused(false); setPosition(0);
    positionRef.current = 0; playingRef.current = false; pausedRef.current = false;
    tracks.forEach((t) => stopTrackNode(t));
    syncSocket({ action: 'stop' });
  };

  const changeTempo = (bpm: number) => {
    setTempoState(Math.max(40, Math.min(300, bpm)));
    syncSocket({ action: 'tempo', tempo: Math.max(40, Math.min(300, bpm)) });
  };

  const updateTrack = (id: string, changes: Partial<TrackConfig>) => {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const updated = { ...t, ...changes };
      if (updated.gainNode && 'volume' in changes) updated.gainNode.gain.value = dbToLinear(updated.volume);
      if (updated.pannerNode && 'pan' in changes) updated.pannerNode.pan.value = updated.pan;
      if (updated.sourceNode && 'pitch' in changes) updated.sourceNode.detune.value = updated.pitch * 100;
      return updated;
    }));
  };

  const toggleMute = (id: string) => {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      if (t.gainNode) t.gainNode.gain.value = t.muted ? dbToLinear(t.volume) : 0;
      return { ...t, muted: !t.muted };
    }));
  };

  const startRecordingFn = async (trackId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setRecording(trackId);
      setRecordingTime(0);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
        const arrayBuffer = await blob.arrayBuffer();
        const ctx = getAudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const fileName = `recording-${trackId}-${Date.now()}.webm`;
        setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, buffer: audioBuffer, recording: false, playing: false, audioFileName: fileName, audioFileType: 'audio/webm;codecs=opus' } : t));
        await saveAudioBuffer(song.id, trackId, arrayBuffer, fileName, 'audio/webm;codecs=opus').catch(() => {});
        setRecording(null);
        setRecordingTime(0);
      };
      recorder.start(100);
      let elapsed = 0;
      recorderTimerRef.current = window.setInterval(() => { elapsed += 0.1; setRecordingTime(elapsed); if (elapsed >= 60) stopRecordingFn(); }, 100);
    } catch (err) { console.error('[record] failed:', err); }
  };

  const stopRecordingFn = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    clearInterval(recorderTimerRef.current);
    setRecording(null);
  };

  const uploadTrack = (trackId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getAudioCtx();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, buffer: audioBuffer, playing: false, audioFileName: file.name, audioFileType: file.type } : t));
      await saveAudioBuffer(song.id, trackId, arrayBuffer, file.name, file.type).catch(() => {});
    };
    input.click();
  };

  const toggleTrackPlay = (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track?.buffer) return;
    if (track.sourceNode) { stopTrackNode(track); updateTrack(trackId, { playing: false }); }
    else { startTrackNode(track, playing && !paused ? positionRef.current / 1000 : 0); updateTrack(trackId, { playing: true }); }
  };

  const setLoopPoint = (point: 'A' | 'B') => {
    if (point === 'A') { setLoopA(position); setLooping(true); } else { setLoopB(position); setLooping(true); }
  };
  const clearLoop = () => { setLoopA(null); setLoopB(null); setLooping(false); };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  const addSong = () => {
    setSongs((prev) => [...prev, {
      id: `song-${Date.now()}`, name: `Song ${prev.length + 1}`, tempo: 120,
      tracks: makeDefaultTracks(), loopA: null, loopB: null, lyrics: '', tabs: '',
    }]);
    setCurrentSongIdx(songs.length);
  };

  const switchSong = (idx: number) => {
    if (idx < 0 || idx >= songs.length) return;
    setSongs((prev) => prev.map((s, i) => i === currentSongIdx ? {
      ...s, tracks, tempo: tempo, loopA, loopB,
      lyrics: externalLyrics ?? s.lyrics,
      tabs: externalTabs ?? s.tabs,
    } : s));
    setCurrentSongIdx(idx);
  };

  const duplicateSong = () => {
    const dup: SongConfig = {
      ...songs[currentSongIdx],
      id: `song-${Date.now()}`, name: `${songs[currentSongIdx].name} (copy)`,
      tracks: songs[currentSongIdx].tracks.map((t) => ({
        ...t, buffer: undefined, sourceNode: null, gainNode: undefined, pannerNode: undefined,
        recording: false, playing: false,
      })),
    };
    setSongs((prev) => [...prev, dup]);
    setCurrentSongIdx(songs.length);
  };

  const renameSong = (name: string) => {
    setSongs((prev) => prev.map((s, i) => i === currentSongIdx ? { ...s, name } : s));
  };

  const deleteSong = () => {
    if (songs.length <= 1) return;
    const newSongs = songs.filter((_, i) => i !== currentSongIdx);
    setSongs(newSongs);
    setCurrentSongIdx(Math.min(currentSongIdx, newSongs.length - 1));
  };

  // Build session data from current state
  const buildSessionData = (): SessionData => {
    const allSongs = songs.map((s, i) => i === currentSongIdx ? {
      ...s, tracks, tempo, loopA, loopB,
      lyrics: externalLyrics ?? s.lyrics,
      tabs: externalTabs ?? s.tabs,
    } : s);
    return {
      songs: allSongs.map((s) => ({
        id: s.id, name: s.name, tempo: s.tempo, loopA: s.loopA, loopB: s.loopB,
        lyrics: s.lyrics, tabs: s.tabs,
        tracks: s.tracks.map((t) => ({
          id: t.id, name: t.name, type: t.type, color: t.color,
          volume: t.volume, pan: t.pan, pitch: t.pitch,
          muted: t.muted, solo: t.solo, height: t.height || 200,
        })),
      })),
      currentSongIndex: currentSongIdx,
    };
  };

  const persistLocalSession = () => saveLocalSession(buildSessionData());

  const exportSession = () => {
    persistLocalSession();
    const blob = new Blob([JSON.stringify(buildSessionData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'jamstream-session.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importSession = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as SessionData;
        if (!data.songs || !Array.isArray(data.songs)) throw new Error('Invalid');
        setSongs(data.songs.map((sd) => ({
          ...sd, loopA: sd.loopA, loopB: sd.loopB, lyrics: sd.lyrics || '', tabs: sd.tabs || '',
          tracks: sd.tracks.map((td) => ({
            ...td, recording: false, playing: false,
            buffer: undefined, sourceNode: null, gainNode: undefined, pannerNode: undefined,
          })),
        })));
        setCurrentSongIdx(Math.min(data.currentSongIndex, data.songs.length - 1));
        stopPlayback();
      } catch (err) { console.error('[import] failed:', err); }
    };
    input.click();
  };

  // Cloud save
  const [cloudSessions, setCloudSessions] = useState<{ id: string; name: string; created_at: string }[]>([]);
  const [showCloud, setShowCloud] = useState(false);

  const cloudSave = () => {
    persistLocalSession();
    const data = buildSessionData();
    socket.emit('save-session', { name: song.name, data }, (result: { id?: string; error?: string }) => {
      if (result.id) {
        console.log('[cloud] saved:', result.id);
        loadCloudList();
      } else {
        console.error('[cloud] save failed:', result.error);
      }
    });
  };

  const cloudLoad = (sessionId: string) => {
    socket.emit('load-session', { id: sessionId }, (result: { id?: string; data?: SessionData; error?: string }) => {
      if (result.data) {
        setSongs(result.data.songs.map((sd) => ({
          ...sd, loopA: sd.loopA, loopB: sd.loopB, lyrics: sd.lyrics || '', tabs: sd.tabs || '',
          tracks: sd.tracks.map((td) => ({
            ...td, recording: false, playing: false,
            buffer: undefined, sourceNode: null, gainNode: undefined, pannerNode: undefined,
          })),
        })));
        setCurrentSongIdx(Math.min(result.data.currentSongIndex, result.data.songs.length - 1));
        stopPlayback();
      }
    });
  };

  const cloudDelete = (sessionId: string) => {
    socket.emit('delete-session', { id: sessionId }, () => loadCloudList());
  };

  const loadCloudList = () => {
    socket.emit('list-sessions', (list: { id: string; name: string; created_at: string }[]) => {
      setCloudSessions(list);
    });
  };

  useEffect(() => {
    const handleState = (state: any) => {
      if (state.action === 'play') { setPlaying(true); setPaused(false); setTempoState(state.tempo); }
      else if (state.action === 'pause') { setPaused(true); }
      else if (state.action === 'stop') { setPlaying(false); setPaused(false); setPosition(0); }
      else if (state.action === 'tempo') { setTempoState(state.tempo); }
    };
    socket.on('backing-track-state', handleState);
    return () => { socket.off('backing-track-state', handleState); };
  }, [socket]);

  useEffect(() => {
    const timer = setTimeout(() => persistLocalSession(), 2000);
    return () => clearTimeout(timer);
  }, [tracks, tempo, songs, currentSongIdx, externalLyrics, externalTabs]);

  const panLabel = (v: number) => {
    if (v === 0) return 'C';
    const pct = Math.abs(Math.round(v * 100));
    return v < 0 ? `L${pct}` : `R${pct}`;
  };

  const startTrackResize = (trackId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    const startY = e.clientY;
    const startH = track.height || 200;
    const onMove = (ev: PointerEvent) => {
      setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, height: Math.max(120, startH + ev.clientY - startY) } : t));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const finishRename = (trackId: string, newName: string) => {
    setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, name: newName } : t));
    setRenamingTrack(null);
  };

  return (
    <div className="track-mixer">
      {/* Playlist bar */}
      <div className="playlist-bar">
        <div className="playlist-select">
          <button className="btn-xs btn-ghost" onClick={() => switchSong(currentSongIdx - 1)} disabled={currentSongIdx <= 0}>◀</button>
          <input className="playlist-name" value={song.name} onChange={(e) => renameSong(e.target.value)} aria-label="Song name" />
          <button className="btn-xs btn-ghost" onClick={() => switchSong(currentSongIdx + 1)} disabled={currentSongIdx >= songs.length - 1}>▶</button>
          <span className="playlist-count">{currentSongIdx + 1}/{songs.length}</span>
        </div>
        <div className="playlist-actions">
          <button className="btn-xs btn-ghost" onClick={addSong} title="Add song">+ Song</button>
          <button className="btn-xs btn-ghost" onClick={duplicateSong} title="Duplicate">⧉</button>
          <button className="btn-xs btn-ghost" onClick={deleteSong} disabled={songs.length <= 1} title="Delete">✕</button>
          <button className="btn-xs btn-ghost" onClick={persistLocalSession} title="Save to browser">💾</button>
          <button className="btn-xs btn-ghost" onClick={exportSession} title="Export JSON">📤</button>
          <button className="btn-xs btn-ghost" onClick={importSession} title="Import JSON">📥</button>
          <button className={`btn-xs ${showCloud ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { if (!showCloud) loadCloudList(); setShowCloud(!showCloud); }} title="Cloud save/load">☁️</button>
        </div>
      </div>

      {/* Cloud panel */}
      {showCloud && (
        <div className="cloud-panel">
          <div className="cloud-actions">
            <button className="btn-xs btn-primary" onClick={cloudSave}>☁️ Save current session</button>
          </div>
          <div className="cloud-list">
            {cloudSessions.length === 0 ? (
              <span className="cloud-empty">No saved sessions on server</span>
            ) : (
              cloudSessions.map((s) => (
                <div key={s.id} className="cloud-item">
                  <span className="cloud-name">{s.name}</span>
                  <span className="cloud-date">{new Date(s.created_at).toLocaleDateString()}</span>
                  <button className="btn-xs btn-secondary" onClick={() => cloudLoad(s.id)}>Load</button>
                  <button className="btn-xs btn-ghost" onClick={() => cloudDelete(s.id)}>✕</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Transport */}
      <div className="transport-controls">
        <div className="transport-buttons">
          <button className={`btn-sm ${playing ? (paused ? 'btn-secondary' : 'btn-danger') : 'btn-primary'}`} onClick={togglePlay} aria-label={playing && !paused ? 'Pause' : 'Play'}>
            {playing && !paused ? '⏸' : '▶'}
          </button>
          <button className="btn-sm btn-secondary" onClick={stopPlayback} disabled={!playing && !paused} aria-label="Stop">⏹</button>
        </div>
        <div className="position-display">{formatTime(position)}</div>
        <div className="tempo-control">
          <label>Tempo</label>
          <div className="tempo-input">
            <button onClick={() => changeTempo(tempo - 5)} aria-label="Decrease tempo">−</button>
            <input type="number" value={tempo} onChange={(e) => changeTempo(parseInt(e.target.value) || 120)} min={40} max={300} />
            <button onClick={() => changeTempo(tempo + 5)} aria-label="Increase tempo">+</button>
          </div>
          <span className="bpm-label">BPM</span>
        </div>
        <div className="loop-controls">
          <button className={`btn-xs ${loopA !== null ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLoopPoint('A')}>A{loopA !== null ? ` ${formatTime(loopA)}` : ''}</button>
          <button className={`btn-xs ${loopB !== null ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLoopPoint('B')}>B{loopB !== null ? ` ${formatTime(loopB)}` : ''}</button>
          {looping && <button className="btn-xs btn-danger" onClick={clearLoop}>✕</button>}
        </div>
      </div>

      {looping && loopA !== null && loopB !== null && (
        <div className="loop-bar" role="status" aria-live="polite">
          <span className="loop-active">🔁 Looping</span>
          <span className="loop-range">{formatTime(loopA)} → {formatTime(loopB)}</span>
        </div>
      )}

      {/* Tracks */}
      <div className="tracks">
        {tracks.map((track) => (
          <div key={track.id} className={`track ${track.muted ? 'track-muted' : ''}`}
            style={{ borderLeftColor: track.color, minHeight: track.height || 200 }}
          >
            <div className="tv-header">
              <div className="tv-name-wrap">
                {renamingTrack === track.id ? (
                  <input className="tv-rename-input" defaultValue={track.name} autoFocus
                    onBlur={(e) => finishRename(track.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') finishRename(track.id, (e.target as HTMLInputElement).value); }}
                    onClick={(e) => e.stopPropagation()} />
                ) : (
                  <span className="tv-name" style={{ color: track.color }}
                    onDoubleClick={() => setRenamingTrack(track.id)} title="Double-click to rename">
                    {track.name}
                  </span>
                )}
                {track.buffer && <span className="track-badge">A</span>}
              </div>
              <div className="tv-header-actions">
                {!track.buffer && recording !== track.id && (
                  <button className="btn-xs btn-secondary" onClick={() => startRecordingFn(track.id)} disabled={recording !== null} title="Record">●</button>
                )}
                {recording === track.id ? (
                  <button className="btn-xs btn-danger" onClick={stopRecordingFn}>⏹ {formatTime(recordingTime)}</button>
                ) : (
                  <button className="btn-xs btn-secondary" onClick={() => uploadTrack(track.id)} title={track.buffer ? 'Replace' : 'Load'}>📁</button>
                )}
                {track.buffer && (
                  <button className={`btn-xs ${track.playing ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggleTrackPlay(track.id)}
                    title={track.playing ? 'Stop' : 'Play'}>
                    {track.playing ? '⏹' : '▶'}
                  </button>
                )}
                <button className={`btn-xs ${track.muted ? 'btn-danger' : 'btn-ghost'}`} onClick={() => toggleMute(track.id)}>M</button>
              </div>
            </div>

            <div className="tv-controls">
              <div className="tv-row">
                <span className="tv-label">Vol</span>
                <input type="range" min={-40} max={12} step={0.5} value={track.volume}
                  onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  className="tv-slider" aria-label={`${track.name} volume`} />
                <span className="tv-value">{track.volume <= -40 ? '-∞' : `${track.volume > 0 ? '+' : ''}${track.volume.toFixed(1)} dB`}</span>
              </div>
              <div className="tv-row">
                <span className="tv-label">Pan</span>
                <input type="range" min={-1} max={1} step={0.05} value={track.pan}
                  onChange={(e) => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
                  className="tv-slider" aria-label={`${track.name} pan`} />
                <span className="tv-value">{panLabel(track.pan)}</span>
              </div>
              <div className="tv-row">
                <span className="tv-label">Pitch</span>
                <input type="range" min={-12} max={12} step={1} value={track.pitch}
                  onChange={(e) => updateTrack(track.id, { pitch: parseInt(e.target.value) })}
                  className="tv-slider" aria-label={`${track.name} pitch`} />
                <span className="tv-value">{track.pitch > 0 ? '+' : ''}{track.pitch} st</span>
              </div>
            </div>

            <div className="track-resize-handle" onPointerDown={(e) => startTrackResize(track.id, e)} />
          </div>
        ))}
      </div>

      <div className="add-track">
        <button className="btn-sm btn-ghost" onClick={() => {
          setTracks((prev) => [...prev, {
            id: `audio-${Date.now()}`, name: `Track ${prev.length + 1}`, type: 'audio',
            color: TRACK_COLORS[prev.length % TRACK_COLORS.length],
            volume: 0, pan: 0, pitch: 0, muted: false, solo: false,
            recording: false, playing: false, height: 200,
          }]);
        }}>+ Add Track</button>
      </div>

      <div className="tracks-info">
        <p>Load audio files or record to each track. Press ▶ to play.</p>
        <p className="hint">Double-click track name to rename. Drag bottom edge to resize track height.</p>
      </div>
    </div>
  );
}
