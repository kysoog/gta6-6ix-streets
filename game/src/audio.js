// Procedural audio: engine hum, siren, gunshot, impact, crash. No files, no autoplay — the first
// user gesture starts the AudioContext; after that everything plays freely.
export function createAudio() {
  let ctx = null;
  let started = false;
  let engine = null, siren = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') return false;
    started = true;
    return true;
  }

  function start() { ensure(); }

  // Low drone: filtered white noise + two detuned oscillators = an idling car.
  function engineLoop(active) {
    if (!ensure()) return;
    if (!engine) {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer; noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 900;
      const gain = ctx.createGain(); gain.gain.value = 0.05;
      const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth';
      osc1.detune.value = 7; osc2.detune.value = -7;
      const mix = ctx.createGain(); mix.gain.value = 0.03;
      noise.connect(filter); filter.connect(gain);
      osc1.connect(mix); osc2.connect(mix); mix.connect(gain);
      gain.connect(ctx.destination);
      noise.start(); osc1.start(); osc2.start();
      engine = { noise, filter, gain, osc1, osc2, mix };
    }
    engine.gain.gain.setTargetAtTime(active ? 0.14 : 0.03, ctx.currentTime, 0.1);
    const rate = active ? 24 : 14;
    engine.osc1.frequency.setTargetAtTime(110 + rate * 1.6, ctx.currentTime, 0.08);
    engine.osc2.frequency.setTargetAtTime(110 + rate * 1.65, ctx.currentTime, 0.08);
  }

  function sirenLoop(active) {
    if (!ensure()) return;
    if (!siren) {
      const osc = ctx.createOscillator(); osc.type = 'square';
      const gain = ctx.createGain(); gain.gain.value = 0;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      siren = { osc, gain };
    }
    siren.gain.gain.setTargetAtTime(active ? 0.18 : 0, ctx.currentTime, 0.05);
    const t = ctx.currentTime;
    const freq = 700 + 500 * Math.sin(t * 6);
    siren.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.03);
  }

  // Gunshot: noise burst with fast exponential decay.
  function gunshot() {
    if (!ensure()) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i * 30);
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = 0.35;
    noise.connect(gain); gain.connect(ctx.destination);
    noise.start();
  }

  function impact() {
    if (!ensure()) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i * 16);
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = 0.25;
    noise.connect(gain); gain.connect(ctx.destination);
    noise.start();
  }

  function crash() {
    if (!ensure()) return;
    const buffer = ctx.createBuffer(2, ctx.sampleRate * 0.5, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i * 10);
    }
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = 0.5;
    noise.connect(gain); gain.connect(ctx.destination);
    noise.start();
  }

  return { start, engineLoop, sirenLoop, gunshot, impact, crash, get started() { return started; } };
}
