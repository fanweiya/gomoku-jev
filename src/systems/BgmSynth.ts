// Guzheng background music player featuring the classic masterpiece "High Mountain and Flowing Stream" (高山流水)
// Uses real studio acoustic recording with smooth fading and synthesizer fallback.

export class AncientBgmSynth {
  private audioElement: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private timerId: number | null = null;
  private masterGain: GainNode | null = null;
  private droneOscillators: OscillatorNode[] = [];
  private volume = 0.38;
  private fadeInterval: number | null = null;

  // 自动播放策略要求首次播放必须由用户手势触发；恢复开启状态时
  // 先尝试播放，被拦截后在首次手势到来时重试一次。
  private readonly onFirstGesture = (): void => {
    window.removeEventListener('pointerdown', this.onFirstGesture);
    window.removeEventListener('keydown', this.onFirstGesture);
    if (this.isPlaying) {
      this.start();
    }
  };

  // Traditional Pentatonic scale for fallback synthesis: Gong, Shang, Jiao, Zhi, Yu
  private readonly scale: number[] = [
    146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33,
  ];
  private readonly droneNotes = [146.83, 220.00];

  constructor() {
    const saved = localStorage.getItem('gomoku_bgm_enabled');
    this.isPlaying = saved === 'true';
    this.initAudioElement();
    if (this.isPlaying) {
      this.start();
      window.addEventListener('pointerdown', this.onFirstGesture);
      window.addEventListener('keydown', this.onFirstGesture);
    }
  }

  private initAudioElement(): void {
    if (typeof window === 'undefined') return;
    this.audioElement = new Audio('/audio/gaoshan_liushui.mp3');
    this.audioElement.loop = true;
    this.audioElement.volume = this.volume;
    // 延迟到实际播放时才加载音频文件，避免页面打开就下载 2.6MB 资源
    this.audioElement.preload = 'none';

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

    // AudioContext 可能因自动播放策略处于 suspended，手势重试时恢复
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.audioElement) {
      this.stopFade();
      this.audioElement.volume = 0;
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // stop() 之后才结算的不要再淡入；mp3 播放成功时先停掉
            // 之前兜底启动的合成器，避免 mp3 与合成双声道叠加。
            if (!this.isPlaying) return;
            this.stopFallbackSynth();
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

  public dispose(): void {
    window.removeEventListener('pointerdown', this.onFirstGesture);
    window.removeEventListener('keydown', this.onFirstGesture);
    this.stop();
    this.stopFade();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.removeAttribute('src');
      this.audioElement.load();
      this.audioElement = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.droneOscillators = [];
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

    // 上一次停止时的增益节点可能仍在淡出，先断开再重建，避免节点累积
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
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
    // 逐个停止长音振荡器，避免 stop→start 循环累积永不停止的声源
    for (const osc of this.droneOscillators) {
      osc.stop();
    }
    this.droneOscillators = [];
    const gain = this.masterGain;
    if (gain && this.ctx) {
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => {
        gain.disconnect();
        if (this.masterGain === gain) {
          this.masterGain = null;
        }
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
      this.droneOscillators.push(osc);
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
