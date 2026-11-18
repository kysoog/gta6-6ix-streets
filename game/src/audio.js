// Procedural audio: engine hum, siren, gunshot, impact, crash, horn, two radio stations.
// No files, no autoplay — the first user gesture starts the AudioContext; after that everything plays freely.
export function createAudio() {
  let ctx = null;
  let started = false;
  let engine = null, siren = null;
  let radioOsc1 = null, radioOsc2 = null, radioGain = null;
  let radioStation = 0;

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

  // Siren blip on wanted-level change: rising two-tone wail.
  function wantedSiren() {
    if (!ensure()) return;
    const osc = ctx.createOscillator(); osc.type = 'square';
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(920, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.22);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    setTimeout(() => { try { osc.stop(); } catch {}; }, 260);
  }

  // Two radio stations: each a drone from two detuned oscillators retuned on switch.
  // Station 0 is Neon Nights (sawtooth chorus), station 1 is Vice FM (square reese-ish drone).
  function radioTone(index) {
    if (!ensure()) return;
    radioStation = index === 0 ? 0 : 1;
    if (!radioOsc1) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth';
      const g = ctx.createGain(); g.gain.value = 0.02;
      o1.connect(g); o2.connect(g); g.connect(ctx.destination);
      o1.start(); o2.start();
      radioOsc1 = o1; radioOsc2 = o2; radioGain = g;
    }
    const base = radioStation === 0 ? 165 : 220;
    radioOsc1.detune.cancelScheduledValues(0);
    radioOsc2.detune.cancelScheduledValues(0);
    radioOsc1.frequency.setTargetAtTime(base, ctx.currentTime, 0.1);
    radioOsc2.frequency.setTargetAtTime(base + 6, ctx.currentTime, 0.1);
    radioOsc1.detune.value = radioStation === 0 ? -7 : 9;
    radioOsc2.detune.value = radioStation === 0 ? 7 : -9;
    radioOsc1.type = radioStation === 0 ? 'sawtooth' : 'square';
    radioOsc2.type = radioStation === 0 ? 'sawtooth' : 'square';
  }

  // Horn: short falling sawtooth honk.
  function horn() {
    if (!ensure()) return;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.35);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    setTimeout(() => { try { osc.stop(); } catch {}; }, 400);
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

  return { start, engineLoop, sirenLoop, wantedSiren, radioTone, horn, gunshot, impact, crash, get started() { return started; } };
}
