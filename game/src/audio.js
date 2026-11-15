// Procedural WebAudio only: no audio files, no network. Every sound is a short noise
// burst or an oscillator envelope built at runtime. The context is created lazily on the
// first user gesture (the play click), so the page never asks for audio before it may.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  // A gunshot: a sharp noise crack plus a low thump. Pitch and body vary per weapon.
  function shot(kind) {
    if (kind === 'sniper') {
      burst(0.28, 900, 0.9);
      tone(140, 0.22, 0.5, 'sine', 55);
    } else if (kind === 'shotgun') {
      burst(0.24, 1400, 0.95);
      tone(110, 0.2, 0.55, 'sine', 50);
    } else if (kind === 'smg') {
      burst(0.09, 2400, 0.5);
      tone(190, 0.08, 0.25, 'sine', 90);
    } else if (kind === 'pistol') {
      burst(0.12, 1800, 0.6);
      tone(160, 0.1, 0.3, 'sine', 70);
    } else {
      burst(0.14, 2000, 0.7);
      tone(150, 0.12, 0.35, 'sine', 65);
    }
  }

  function enemyShot(distance) {
    // Distant shots are quieter and duller, so a far fight still reads.
    const volume = Math.max(0.08, 0.45 - distance * 0.012);
    burst(0.12, 1500, volume);
    tone(140, 0.1, volume * 0.5, 'sine', 60);
  }

  function dryFire() {
    tone(1400, 0.04, 0.12, 'square');
  }

  function reload() {
    tone(900, 0.05, 0.18, 'square');
    setTimeout(() => tone(620, 0.05, 0.18, 'square'), 160);
    setTimeout(() => tone(1100, 0.05, 0.2, 'square'), 420);
  }

  function step() {
    burst(0.05, 500, 0.1);
  }

  function hit() {
    tone(1900, 0.05, 0.22, 'square');
  }

  function kill() {
    tone(1900, 0.05, 0.22, 'square');
    setTimeout(() => tone(2600, 0.09, 0.25, 'square'), 70);
  }

  function hurt() {
    tone(220, 0.14, 0.3, 'sawtooth', 110);
  }

  function plantBeep(final) {
    tone(final ? 1500 : 1050, final ? 0.22 : 0.09, 0.22, 'square');
  }

  function explosion() {
    burst(0.9, 320, 1.0);
    tone(70, 0.8, 0.7, 'sine', 28);
  }

  function grenadeBounce() {
    tone(340, 0.06, 0.14, 'sine', 200);
  }

  function win() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.25, 'triangle'), i * 130));
  }

  function lose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.26, 0.25, 'triangle'), i * 150));
  }

  function buy() {
    tone(880, 0.07, 0.2, 'triangle');
    setTimeout(() => tone(1320, 0.1, 0.2, 'triangle'), 70);
  }

  function denied() {
    tone(220, 0.12, 0.2, 'square');
  }

  function scope() {
    tone(700, 0.06, 0.12, 'sine', 900);
  }

  return { unlock, shot, enemyShot, dryFire, reload, step, hit, kill, hurt, plantBeep, explosion, grenadeBounce, win, lose, buy, denied, scope };
}
