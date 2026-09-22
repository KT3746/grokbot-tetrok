/**
 * Sons e música sintetizados no navegador (Web Audio).
 * Nada de amostras prontas — só tons originais do TETROK.
 */

const STORAGE_KEY = "tetrok-som";

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = readMuted();
    this.unlocked = false;
    this.musicOn = false;
    this.musicTimer = null;
    this.step = 0;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1;
      this.sfxGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.unlocked = true;
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (this.master) {
      this.master.gain.value = muted ? 0 : 0.28;
    }
    if (muted) this.stopMusic(true);
    else if (this.musicOn) this.startMusic(true);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone({
    freq = 440,
    dur = 0.08,
    type = "sine",
    vol = 0.2,
    slide = 0,
    delay = 0,
    filter = 0,
    dest = null,
  }) {
    if (this.muted || !this.ctx || !this.unlocked) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const out = dest || this.sfxGain || this.master;
    if (filter) {
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = filter;
      osc.connect(filt);
      filt.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur = 0.06, vol = 0.08) {
    if (this.muted || !this.ctx || !this.unlocked) return;
    const t = this.now();
    const size = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.sfxGain || this.master);
    src.start(t);
  }

  /** Melodia alegre e bem audível (sem chiado). */
  startMusic(resumeOnly = false) {
    this.unlock();
    if (!this.ctx || this.muted) return;
    this.musicOn = true;
    if (this.musicTimer) return;
    if (!resumeOnly) this.step = 0;

    // Arpejo alegre em C/G — médio, sem agudos secos
    const melody = [
      392.0, 493.88, 587.33, 523.25,
      392.0, 493.88, 659.25, 587.33,
      349.23, 440.0, 523.25, 493.88,
      392.0, 523.25, 659.25, 783.99,
    ];
    const bass = [98.0, 98.0, 130.81, 130.81, 87.31, 87.31, 110.0, 98.0];

    const tick = () => {
      if (!this.musicOn || this.muted || !this.ctx) return;
      const i = this.step % melody.length;
      const beat = this.step % 4 === 0;
      this.tone({
        freq: melody[i],
        dur: 0.2,
        type: "triangle",
        vol: 0.09,
        dest: this.musicGain,
        filter: 2200,
      });
      this.tone({
        freq: melody[i] * 0.5,
        dur: 0.18,
        type: "sine",
        vol: 0.045,
        dest: this.musicGain,
        filter: 1200,
      });
      if (beat) {
        this.tone({
          freq: bass[(this.step / 4) % bass.length | 0],
          dur: 0.26,
          type: "sine",
          vol: 0.11,
          dest: this.musicGain,
          filter: 450,
        });
      }
      this.step += 1;
    };

    tick();
    this.musicTimer = setInterval(tick, 195);
  }

  stopMusic(keepFlag = false) {
    if (!keepFlag) this.musicOn = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  pauseMusic() {
    this.stopMusic(true);
  }

  move() {
    this.tone({ freq: 400, dur: 0.03, type: "square", vol: 0.045, filter: 1600 });
  }

  rotate() {
    this.tone({ freq: 660, dur: 0.05, type: "triangle", vol: 0.11 });
    this.tone({ freq: 990, dur: 0.045, type: "sine", vol: 0.07, delay: 0.015 });
  }

  /** Fanfarra tipo “GOOOL!” quando a peça trava. */
  gol(big = false) {
    const boost = big ? 1.15 : 1;
    // subida estilo gol
    [392, 523, 659, 784].forEach((freq, i) => {
      this.tone({
        freq,
        dur: 0.14 + i * 0.02,
        type: "triangle",
        vol: 0.14 * boost,
        delay: i * 0.055,
      });
    });
    // “crowd” curto e grave (não agudo seco)
    this.noise(0.12, 0.035 * boost);
    this.tone({
      freq: 220,
      dur: 0.28,
      type: "sine",
      vol: 0.12 * boost,
      slide: 180,
      delay: 0.12,
      filter: 900,
    });
    this.tone({
      freq: 880,
      dur: 0.2,
      type: "sine",
      vol: 0.08 * boost,
      delay: 0.22,
      filter: 2400,
    });
  }

  lock() {
    this.gol(false);
  }

  hardDrop() {
    this.gol(true);
  }

  hold() {
    this.tone({ freq: 500, dur: 0.09, type: "sine", vol: 0.1, slide: 240 });
  }

  lineClear(count) {
    // zap + whoosh (bem diferente do acorde antigo)
    this.noise(0.08 + count * 0.03, 0.09 + count * 0.025);
    const base = 180 + count * 40;
    this.tone({
      freq: base,
      dur: 0.12,
      type: "sawtooth",
      vol: 0.11,
      delay: 0,
    });
    this.tone({
      freq: base * 2.2,
      dur: 0.16,
      type: "square",
      vol: 0.07,
      delay: 0.04,
    });
    // sweep ascendente curto
    for (let i = 0; i < 3 + count; i++) {
      this.tone({
        freq: 520 + i * (90 + count * 20),
        dur: 0.07,
        type: "sine",
        vol: 0.09,
        delay: 0.06 + i * 0.035,
      });
    }
    if (count >= 4) {
      this.noise(0.18, 0.12);
      this.tone({ freq: 90, dur: 0.28, type: "triangle", vol: 0.14, delay: 0.05 });
      this.tone({ freq: 1760, dur: 0.18, type: "sine", vol: 0.08, delay: 0.22 });
    }
  }

  levelUp() {
    [523, 659, 784, 988, 1175].forEach((freq, i) => {
      this.tone({ freq, dur: 0.13, type: "sine", vol: 0.11, delay: i * 0.065 });
    });
  }

  gameOver() {
    this.stopMusic();
    [392, 349, 294, 246, 196].forEach((freq, i) => {
      this.tone({
        freq,
        dur: 0.22,
        type: "triangle",
        vol: 0.12,
        delay: i * 0.12,
        slide: -30,
      });
    });
  }

  pause() {
    this.pauseMusic();
    this.tone({ freq: 330, dur: 0.08, type: "sine", vol: 0.08 });
    this.tone({ freq: 247, dur: 0.1, type: "sine", vol: 0.07, delay: 0.08 });
  }

  resume() {
    this.tone({ freq: 247, dur: 0.07, type: "sine", vol: 0.07 });
    this.tone({ freq: 330, dur: 0.09, type: "sine", vol: 0.08, delay: 0.07 });
  }

  start() {
    [392, 523, 659].forEach((freq, i) => {
      this.tone({ freq, dur: 0.12, type: "triangle", vol: 0.1, delay: i * 0.06 });
    });
    // Sem botão de mudo: só efeitos, sem música de fundo
  }
}

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
