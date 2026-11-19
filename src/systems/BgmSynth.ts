// Guzheng background music player featuring the classic masterpiece "High Mountain and Flowing Stream" (高山流水)
// Uses real studio acoustic recording with smooth fading and synthesizer fallback.

export class AncientBgmSynth {
  private audioElement: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private timerId: number | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.38;
  private fadeInterval: number | null = null;

  // Traditional Pentatonic scale for fallback synthesis: Gong, Shang, Jiao, Zhi, Yu
  private readonly scale: number[] = [
    146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33,
  ];
  private readonly droneNotes = [146.83, 220.00];

  constructor() {
    const saved = localStorage.getItem('gomoku_bgm_enabled');
    this.isPlaying = saved === 'true';
    this.initAudioElement();
  }

  private initAudioElement(): void {
    if (typeof window === 'undefined') return;
    this.audioElement = new Audio('/audio/gaoshan_liushui.mp3');
    this.audioElement.loop = true;
    this.audioElement.volume = this.volume;
    this.audioElement.preload = 'auto';

    this.audioElement.addEventListener('error', () => {
      // If audio file fails to load, gracefully fallback to web audio synth
      if (this.isPlaying) {
        this.startFallbackSynth();
      }
    });
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
    this.isPlaying = true;

    if (this.audioElement) {
      this.stopFade();
      this.audioElement.volume = 0;
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.fadeInAudio();
          })
          .catch(() => {
            // Autoplay blocked or decode failed -> trigger fallback synth
            this.startFallbackSynth();
          });
      }
    } else {
      this.startFallbackSynth();
    }
  }

  public stop(): void {
    this.isPlaying = false;
    this.stopFade();

    if (this.audioElement && !this.audioElement.paused) {
      this.fadeOutAudio();
    }
    this.stopFallbackSynth();
  }

  private fadeInAudio(): void {
    if (!this.audioElement) return;
    let curVol = 0;
    const targetVol = this.volume;
    const step = targetVol / 16;
    this.fadeInterval = window.setInterval(() => {
      curVol += step;
      if (curVol >= targetVol) {
        if (this.audioElement) this.audioElement.volume = targetVol;
        this.stopFade();
      } else if (this.audioElement) {
        this.audioElement.volume = curVol;
      }
    }, 40);
  }

  private fadeOutAudio(): void {
    if (!this.audioElement) return;
    let curVol = this.audioElement.volume;
    const step = curVol / 12;
    this.fadeInterval = window.setInterval(() => {
      curVol -= step;
      if (curVol <= 0.02) {
        if (this.audioElement) {
          this.audioElement.pause();
          this.audioElement.volume = this.volume;
        }
        this.stopFade();
      } else if (this.audioElement) {
        this.audioElement.volume = curVol;
      }
    }, 35);
  }

  private stopFade(): void {
    if (this.fadeInterval !== null) {
      window.clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.audioElement) {
      this.audioElement.volume = this.volume;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
  }

  // --- Fallback Web Audio Synthesizer ---
  private startFallbackSynth(): void {
    if (this.ctx && this.timerId !== null) return;

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

    this.startDrone();
    this.scheduleNextNote();
  }

  private stopFallbackSynth(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => {
        if (!this.isPlaying && this.ctx) {
          this.ctx.suspend();
        }
      }, 500);
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
      osc.frequency.setValueAtTime(freq / 2, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, this.ctx.currentTime + 3.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
    }
  }

  private scheduleNextNote(): void {
    if (!this.isPlaying || !this.ctx) return;

    const delayMs = 1200 + Math.random() * 2200;
    this.timerId = window.setTimeout(() => {
      if (!this.isPlaying) return;
      this.playPluckNote();
      this.scheduleNextNote();
    }, delayMs);
  }

  private playPluckNote(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const noteIdx = Math.floor(Math.random() * this.scale.length);
    const freq = this.scale[noteIdx];

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const chime = this.ctx.createOscillator();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(freq * 2.76, now);

    const noteGain = this.ctx.createGain();
    const chimeGain = this.ctx.createGain();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + 1.8);

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
