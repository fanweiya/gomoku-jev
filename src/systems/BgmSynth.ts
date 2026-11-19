// Ancient Chinese pentatonic ambient electronic synthesizer using Web Audio API

export class AncientBgmSynth {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private timerId: number | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.35;

  // Traditional Pentatonic scale: Gong (1), Shang (2), Jiao (3), Zhi (5), Yu (6)
  // Base D Dorian / Chinese Pentatonic: D3, E3, G3, A3, C4, D4, E4, G4, A4, C5, D5
  private readonly scale: number[] = [
    146.83, // D3
    164.81, // E3
    196.00, // G3
    220.00, // A3
    261.63, // C4
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
  ];

  private readonly droneNotes = [146.83, 220.00]; // D3 + A3

  constructor() {
    const saved = localStorage.getItem('gomoku_bgm_enabled');
    // Default off until user turns it on (browsers require user gesture)
    this.isPlaying = saved === 'true';
  }

  public get active(): boolean {
    return this.isPlaying;
  }

  public toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    localStorage.setItem('gomoku_bgm_enabled', String(this.isPlaying));
    return this.isPlaying;
  }

  public start(): void {
    if (this.ctx && this.isPlaying) return;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.isPlaying = true;
    this.startDrone();
    this.scheduleNextNote();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      setTimeout(() => {
        if (!this.isPlaying && this.ctx) {
          this.ctx.suspend();
        }
      }, 600);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
  }

  private startDrone(): void {
    if (!this.ctx || !this.masterGain) return;

    for (const freq of this.droneNotes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq / 2, this.ctx.currentTime); // Lower octave drone

      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 3.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
    }
  }

  private scheduleNextNote(): void {
    if (!this.isPlaying || !this.ctx) return;

    const delayMs = 1200 + Math.random() * 2400; // Peaceful, spacious tempo
    this.timerId = window.setTimeout(() => {
      if (!this.isPlaying) return;
      this.playPluckNote();
      this.scheduleNextNote();
    }, delayMs);
  }

  // Synthesizes ancient Guzheng / Guqin string pluck + Bianzhong chime harmonic
  private playPluckNote(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const noteIdx = Math.floor(Math.random() * this.scale.length);
    const freq = this.scale[noteIdx];

    // Fundamental oscillator (Guzheng string)
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Harmonic bell/chime overtone oscillator (Bianzhong chime)
    const chime = this.ctx.createOscillator();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(freq * 2.76, now); // Inharmonic metallic ratio

    const noteGain = this.ctx.createGain();
    const chimeGain = this.ctx.createGain();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + 1.8);

    // Quick strike attack and slow resonant ringing decay
    noteGain.gain.setValueAtTime(0.001, now);
    noteGain.gain.linearRampToValueAtTime(0.3, now + 0.025);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    chimeGain.gain.setValueAtTime(0.001, now);
    chimeGain.gain.linearRampToValueAtTime(0.06, now + 0.015);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    chime.connect(chimeGain);
    chimeGain.connect(this.masterGain);

    osc.start(now);
    chime.start(now);

    osc.stop(now + 3.0);
    chime.stop(now + 1.6);
  }
}
