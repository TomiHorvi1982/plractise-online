const SAMPLE_RATE = 44100;

function renderNoise(length: number, ctx: AudioContext): Float32Array {
  const buf = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return data;
}

function renderSine(ctx: AudioContext, length: number, freq: number, startPhase = 0): Float32Array {
  const buf = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE + startPhase);
  return data;
}

function applyEnvelope(data: Float32Array, attack: number, decay: number, release: number) {
  const len = data.length;
  const aS = Math.floor(attack * SAMPLE_RATE);
  const dS = Math.floor(decay * SAMPLE_RATE);
  const rS = Math.floor(release * SAMPLE_RATE);
  const rStart = len - rS;
  for (let i = 0; i < len; i++) {
    let env = 1;
    if (i < aS) env = i / aS;
    else if (i < aS + dS) env = 1 - (i - aS) / dS * 0.6;
    if (i >= rStart) env *= (1 - (i - rStart) / rS);
    data[i] *= env;
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function mixInto(dest: Float32Array, src: Float32Array, offset: number, gain: number) {
  for (let i = 0; i < src.length && offset + i < dest.length; i++) {
    dest[offset + i] += src[i] * gain;
  }
}

function generateKick(ctx: AudioContext, length: number): Float32Array {
  const buf = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = lerp(150, 45, t / 0.15);
    data[i] = Math.sin(2 * Math.PI * freq * t) * 0.6;
  }
  applyEnvelope(data, 0.001, 0.05, 0.15);
  return data;
}

function generateSnare(ctx: AudioContext, length: number): Float32Array {
  const noise = renderNoise(length, ctx);
  const tone = renderSine(ctx, length, 200);
  for (let i = 0; i < length; i++) tone[i] = tone[i] * 0.3 + noise[i] * 0.5;
  applyEnvelope(tone, 0.001, 0.01, 0.12);
  return tone;
}

function generateHihat(ctx: AudioContext, length: number): Float32Array {
  const noise = renderNoise(length, ctx);
  applyEnvelope(noise, 0.001, 0.005, 0.08);
  return noise;
}

function generateBassNote(ctx: AudioContext, length: number, freq: number): Float32Array {
  const buf = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let val = Math.sin(2 * Math.PI * freq * t) * 0.4;
    val += Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
    data[i] = val;
  }
  applyEnvelope(data, 0.02, 0.05, 0.4);
  return data;
}

function generateChord(ctx: AudioContext, length: number, freqs: number[]): Float32Array {
  const buf = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;
    for (const f of freqs) {
      val += Math.sin(2 * Math.PI * f * t) * 0.12;
    }
    data[i] = val;
  }
  applyEnvelope(data, 0.01, 0.3, 0.8);
  return data;
}

function generatePad(ctx: AudioContext, length: number, freqs: number[]): Float32Array {
  const buf = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let val = 0;
    for (const f of freqs) {
      val += Math.sin(2 * Math.PI * f * t) * 0.08;
      val += Math.sin(2 * Math.PI * f * 2 * t) * 0.04;
    }
    data[i] = val;
  }
  applyEnvelope(data, 0.5, 0.2, 1.5);
  return data;
}

const NOTE = {
  C1: 32.7, G1: 49.0, A1: 55.0, F1: 43.65,
  C2: 65.41, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0,
};

export function generateDemoDrums(audioCtx: AudioContext): AudioBuffer {
  const bpm = 120;
  const beatLen = SAMPLE_RATE * 60 / bpm;
  const bars = 4;
  const totalLen = Math.floor(beatLen * 4 * bars);
  const buffer = audioCtx.createBuffer(1, totalLen, SAMPLE_RATE);
  const out = buffer.getChannelData(0);

  const kickLen = Math.floor(SAMPLE_RATE * 0.2);
  const snareLen = Math.floor(SAMPLE_RATE * 0.15);
  const hihatLen = Math.floor(SAMPLE_RATE * 0.06);

  const kick = generateKick(audioCtx, kickLen);
  const snare = generateSnare(audioCtx, snareLen);
  const hihat = generateHihat(audioCtx, hihatLen);

  for (let bar = 0; bar < bars; bar++) {
    const barOff = bar * beatLen * 4;
    mixInto(out, kick, barOff, 0.8);
    mixInto(out, kick, barOff + beatLen * 2, 0.8);
    mixInto(out, snare, barOff + beatLen, 0.6);
    mixInto(out, snare, barOff + beatLen * 3, 0.6);
    for (let i = 0; i < 8; i++) {
      mixInto(out, hihat, barOff + i * beatLen * 0.5, 0.25);
    }
    if (bar === 1) {
      mixInto(out, kick, barOff + beatLen, 0.7);
      mixInto(out, kick, barOff + beatLen * 2.5, 0.7);
    }
    if (bar === 3) {
      mixInto(out, snare, barOff + beatLen * 3.5, 0.5);
    }
  }
  return buffer;
}

export function generateDemoBass(audioCtx: AudioContext): AudioBuffer {
  const bpm = 120;
  const beatLen = SAMPLE_RATE * 60 / bpm;
  const bars = 4;
  const totalLen = Math.floor(beatLen * 4 * bars);
  const buffer = audioCtx.createBuffer(1, totalLen, SAMPLE_RATE);
  const out = buffer.getChannelData(0);

  const pattern: number[] = [
    NOTE.C2, NOTE.C2, NOTE.G2, NOTE.G2,
    NOTE.A2, NOTE.A2, NOTE.F2, NOTE.F2,
    NOTE.C2, NOTE.G2, NOTE.A2, NOTE.F2,
    NOTE.C2, NOTE.E2, NOTE.G2, NOTE.A2,
  ];

  const noteLen = Math.floor(beatLen * 2);
  for (let i = 0; i < pattern.length; i++) {
    const note = generateBassNote(audioCtx, noteLen, pattern[i]);
    mixInto(out, note, i * noteLen, 0.7);
  }
  return buffer;
}

export function generateDemoGuitar(audioCtx: AudioContext): AudioBuffer {
  const bpm = 120;
  const beatLen = SAMPLE_RATE * 60 / bpm;
  const bars = 4;
  const totalLen = Math.floor(beatLen * 4 * bars);
  const buffer = audioCtx.createBuffer(1, totalLen, SAMPLE_RATE);
  const out = buffer.getChannelData(0);

  const chords: number[][] = [
    [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.C4],
    [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4],
    [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4],
    [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.F4],
  ];

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    const barOff = bar * beatLen * 4;
    for (let strum = 0; strum < 4; strum++) {
      const strumDelay = strum * 0.03 * SAMPLE_RATE;
      const noteLen = Math.floor(beatLen * 0.9);
      const note = generateChord(audioCtx, noteLen, chord);
      const offset = barOff + strum * beatLen + strumDelay;
      mixInto(out, note, Math.floor(offset), 0.3);
    }
  }
  return buffer;
}

export function generateDemoVocals(audioCtx: AudioContext): AudioBuffer {
  const bpm = 120;
  const beatLen = SAMPLE_RATE * 60 / bpm;
  const bars = 4;
  const totalLen = Math.floor(beatLen * 4 * bars);
  const buffer = audioCtx.createBuffer(1, totalLen, SAMPLE_RATE);
  const out = buffer.getChannelData(0);

  const padNotes: number[][] = [
    [NOTE.C3, NOTE.E3, NOTE.G3],
    [NOTE.G3, NOTE.B3, NOTE.D4],
    [NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.F3, NOTE.A3, NOTE.C4],
  ];

  for (let bar = 0; bar < bars; bar++) {
    const freqs = padNotes[bar % padNotes.length];
    const barOff = bar * beatLen * 4;
    const noteLen = Math.floor(beatLen * 4);
    const pad = generatePad(audioCtx, noteLen, freqs);
    mixInto(out, pad, barOff, 0.25);
  }
  return buffer;
}
