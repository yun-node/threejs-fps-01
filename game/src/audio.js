// audio.js — all sound is synthesised with WebAudio. No audio files.
export function createAudio() {
  let ctx = null;
  let master = null;
  const ensure = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  };
  // One shared noise buffer, built lazily.
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function burst(dur, freq, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }
  function noiseHit(dur, filterFreq, vol) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }
  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'sniper') { noiseHit(0.28, 900, 0.9); burst(0.18, 160, 'square', 0.25, 50); }
      else if (kind === 'smg') { noiseHit(0.08, 2200, 0.5); burst(0.05, 320, 'square', 0.15, 120); }
      else if (kind === 'rifle') { noiseHit(0.14, 1400, 0.7); burst(0.09, 220, 'square', 0.2, 70); }
      else { noiseHit(0.1, 1800, 0.55); burst(0.07, 260, 'square', 0.18, 90); }
    },
    enemyShot() { noiseHit(0.1, 1000, 0.25); },
    reload() { burst(0.06, 900, 'square', 0.12, 500); setTimeout(() => burst(0.06, 1200, 'square', 0.12, 600), 180); },
    dry() { burst(0.04, 1400, 'square', 0.12, 800); },
    hit() { burst(0.07, 1900, 'sine', 0.3, 1400); },
    kill() { burst(0.12, 1200, 'sine', 0.3, 500); setTimeout(() => burst(0.14, 1600, 'sine', 0.3, 700), 90); },
    hurt() { burst(0.15, 140, 'sawtooth', 0.25, 60); },
    step() { noiseHit(0.05, 500, 0.08); },
    plantBeep() { burst(0.09, 880, 'sine', 0.25, 880); },
    bombBeep() { burst(0.05, 1200, 'sine', 0.2, 1200); },
    explosion() { noiseHit(1.2, 300, 1.0); burst(0.9, 90, 'sine', 0.5, 30); },
    win() { [523, 659, 784].forEach((f, i) => setTimeout(() => burst(0.22, f, 'sine', 0.25, f), i * 130)); },
    lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => burst(0.25, f, 'sine', 0.22, f), i * 150)); },
    buy() { burst(0.08, 1000, 'sine', 0.2, 1400); },
  };
}
