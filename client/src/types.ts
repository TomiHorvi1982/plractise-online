export interface TrackConfig {
  id: string;
  name: string;
  type: 'drums' | 'bass' | 'vocals' | 'guitar' | 'audio';
  color: string;
  volume: number;
  pan: number;
  pitch: number;
  muted: boolean;
  solo: boolean;
  recording: boolean;
  playing: boolean;
  buffer?: AudioBuffer;
  sourceNode?: AudioBufferSourceNode | null;
  gainNode?: GainNode;
  pannerNode?: StereoPannerNode;
  height?: number;
  audioFileName?: string;
  audioFileType?: string;
}

export interface SongConfig {
  id: string;
  name: string;
  tempo: number;
  tracks: TrackConfig[];
  loopA: number | null;
  loopB: number | null;
  lyrics: string;
  tabs: string;
}

export interface SessionData {
  songs: SongData[];
  currentSongIndex: number;
}

export interface SongData {
  id: string;
  name: string;
  tempo: number;
  loopA: number | null;
  loopB: number | null;
  lyrics: string;
  tabs: string;
  tracks: {
    id: string;
    name: string;
    type: TrackConfig['type'];
    color: string;
    volume: number;
    pan: number;
    pitch: number;
    muted: boolean;
    solo: boolean;
    height: number;
  }[];
}

export interface FloatingPanelConfig {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  zIndex: number;
}
