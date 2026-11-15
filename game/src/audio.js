// Synthesised sound: no audio files, no network. Every effect is a short WebAudio
// graph (oscillator burst or filtered noise) built on first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function tone(freq, duration, gainValue, type = 'square', slideTo = 0) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'sniper') { noiseBurst(0.22, 900, 0.9); tone(160, 0.14, 0.25, 'sawtooth', 60); }
      else if (kind === 'smg') noiseBurst(0.08, 1600, 0.5);
      else if (kind === 'pistol') noiseBurst(0.12, 1200, 0.6);
      else noiseBurst(0.14, 1100, 0.7);
    },
    enemyShot(distance) {
      const g = Math.max(0.08, 0.5 - distance * 0.012);
      noiseBurst(0.1, 900, g);
    },
    reload() { tone(420, 0.06, 0.2, 'square'); setTimeout(() => tone(620, 0.06, 0.2, 'square'), 160); },
    hit() { tone(880, 0.05, 0.3, 'sine'); },
    kill() { tone(660, 0.08, 0.3, 'sine'); setTimeout(() => tone(990, 0.1, 0.3, 'sine'), 90); },
    hurt() { noiseBurst(0.12, 500, 0.5); tone(140, 0.12, 0.25, 'sawtooth', 80); },
    explosion() { noiseBurst(0.9, 220, 1.0); tone(70, 0.7, 0.5, 'sine', 30); },
    plantBeep() { tone(1200, 0.07, 0.25, 'sine'); },
    plantDone() { tone(1200, 0.1, 0.3, 'sine'); setTimeout(() => tone(1500, 0.14, 0.3, 'sine'), 120); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.25, 'sine'), i * 130)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.25, 'sine'), i * 140)); },
    buy() { tone(980, 0.06, 0.25, 'sine'); setTimeout(() => tone(1318, 0.08, 0.25, 'sine'), 70); },
    denied() { tone(180, 0.12, 0.3, 'square', 120); },
    click() { tone(700, 0.04, 0.2, 'sine'); },
  };
}
