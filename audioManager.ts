'use client'

export type SoundEffect = 
  | 'ball_collision' 
  | 'ball_pocket' 
  | 'cue_shot' 
  | 'match_start' 
  | 'match_win' 
  | 'match_lose'
  | 'button_click'
  | 'notification'
  | 'coin_deposit'
  | 'coin_withdraw'
  | 'timer_warning'
  | 'countdown';

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  isMuted: boolean;
}

export class AudioManager {
  private static instance: AudioManager;
  private audioContext: AudioContext | null = null;
  private settings: AudioSettings = {
    masterVolume: 0.7,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    isMuted: false
  };
  
  private backgroundMusic: HTMLAudioElement | null = null;
  private soundEffects: Map<SoundEffect, AudioBuffer> = new Map();
  private isInitialized = false;

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  constructor() {
    this.loadSettings();
    this.initializeAudioContext();
    this.createSoundEffects();
  }

  private async initializeAudioContext(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.isInitialized = true;
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  private createSoundEffects(): void {
    if (typeof window === 'undefined') return;

    // Create synthetic sound effects using Web Audio API
    this.generateSoundEffects();
  }

  private async generateSoundEffects(): Promise<void> {
    if (!this.audioContext) return;

    const sampleRate = this.audioContext.sampleRate;
    const effects: Record<SoundEffect, () => AudioBuffer> = {
      ball_collision: () => this.generateWhiteNoise(0.1, 800, 200),
      ball_pocket: () => this.generateTone(220, 0.3, 'sine'),
      cue_shot: () => this.generateWhiteNoise(0.05, 2000, 500),
      match_start: () => this.generateChord([261.63, 329.63, 392], 0.8),
      match_win: () => this.generateMelody([523, 659, 784, 1047], 0.5),
      match_lose: () => this.generateTone(146.83, 0.8, 'sine'),
      button_click: () => this.generateTone(800, 0.1, 'square'),
      notification: () => this.generateTone(1000, 0.2, 'sine'),
      coin_deposit: () => this.generateMelody([523, 659, 784], 0.3),
      coin_withdraw: () => this.generateMelody([784, 659, 523], 0.3),
      timer_warning: () => this.generateTone(1200, 0.2, 'square'),
      countdown: () => this.generateTone(880, 0.1, 'square')
    };

    for (const [effect, generator] of Object.entries(effects)) {
      try {
        const buffer = generator();
        this.soundEffects.set(effect as SoundEffect, buffer);
      } catch (error) {
        console.warn(`Failed to generate ${effect} sound:`, error);
      }
    }
  }

  private generateTone(frequency: number, duration: number, type: OscillatorType = 'sine'): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const time = i / sampleRate;
      let value = 0;

      switch (type) {
        case 'sine':
          value = Math.sin(2 * Math.PI * frequency * time);
          break;
        case 'square':
          value = Math.sin(2 * Math.PI * frequency * time) > 0 ? 1 : -1;
          break;
        case 'triangle':
          value = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * frequency * time));
          break;
        case 'sawtooth':
          value = 2 * (time * frequency - Math.floor(0.5 + time * frequency));
          break;
      }

      // Apply envelope
      const envelope = Math.exp(-time * 3);
      data[i] = value * envelope * 0.3;
    }

    return buffer;
  }

  private generateWhiteNoise(duration: number, highFreq: number, lowFreq: number): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      // Generate filtered white noise
      let value = (Math.random() * 2 - 1) * 0.3;
      
      // Simple envelope
      const envelope = Math.exp(-(i / sampleRate) * 8);
      data[i] = value * envelope;
    }

    return buffer;
  }

  private generateChord(frequencies: number[], duration: number): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const time = i / sampleRate;
      let value = 0;

      // Sum all frequencies
      for (const freq of frequencies) {
        value += Math.sin(2 * Math.PI * freq * time) / frequencies.length;
      }

      // Apply envelope
      const envelope = Math.exp(-time * 2);
      data[i] = value * envelope * 0.3;
    }

    return buffer;
  }

  private generateMelody(frequencies: number[], noteDuration: number): AudioBuffer {
    if (!this.audioContext) throw new Error('Audio context not available');

    const sampleRate = this.audioContext.sampleRate;
    const totalDuration = frequencies.length * noteDuration;
    const length = sampleRate * totalDuration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const time = i / sampleRate;
      const noteIndex = Math.floor(time / noteDuration);
      const noteTime = time % noteDuration;
      
      if (noteIndex < frequencies.length) {
        const frequency = frequencies[noteIndex];
        const value = Math.sin(2 * Math.PI * frequency * noteTime);
        const envelope = Math.exp(-noteTime * 4);
        data[i] = value * envelope * 0.3;
      }
    }

    return buffer;
  }

  public async playSound(effect: SoundEffect, volume: number = 1): Promise<void> {
    if (!this.isInitialized || this.settings.isMuted || !this.audioContext) return;

    const buffer = this.soundEffects.get(effect);
    if (!buffer) return;

    try {
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();
      
      source.buffer = buffer;
      
      const finalVolume = this.settings.masterVolume * this.settings.sfxVolume * volume;
      gainNode.gain.setValueAtTime(finalVolume, this.audioContext.currentTime);
      
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      source.start(0);
    } catch (error) {
      console.warn(`Failed to play sound ${effect}:`, error);
    }
  }

  public startBackgroundMusic(): void {
    if (typeof window === 'undefined' || this.settings.isMuted) return;

    // Create a simple ambient background loop
    this.createAmbientMusic();
  }

  private createAmbientMusic(): void {
    if (!this.audioContext) return;

    const playAmbientLoop = () => {
      if (this.settings.isMuted || !this.audioContext) return;

      // Play a subtle ambient chord progression
      const chords = [
        [130.81, 164.81, 196.00], // C major
        [146.83, 185.00, 220.00], // D minor
        [164.81, 207.65, 246.94], // E minor
        [174.61, 220.00, 261.63], // F major
      ];

      let currentChord = 0;
      const playNextChord = () => {
        if (!this.audioContext || this.settings.isMuted) return;

        const buffer = this.generateChord(chords[currentChord], 4.0);
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = buffer;
        gainNode.gain.setValueAtTime(
          this.settings.masterVolume * this.settings.musicVolume * 0.1,
          this.audioContext.currentTime
        );
        
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        source.start(0);

        currentChord = (currentChord + 1) % chords.length;
        
        // Schedule next chord
        setTimeout(playNextChord, 4000);
      };

      playNextChord();
    };

    if (!this.settings.isMuted) {
      playAmbientLoop();
    }
  }

  public stopBackgroundMusic(): void {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
    }
  }

  public setVolume(type: 'master' | 'sfx' | 'music', volume: number): void {
    volume = Math.max(0, Math.min(1, volume));
    
    switch (type) {
      case 'master':
        this.settings.masterVolume = volume;
        break;
      case 'sfx':
        this.settings.sfxVolume = volume;
        break;
      case 'music':
        this.settings.musicVolume = volume;
        break;
    }

    this.saveSettings();
  }

  public setMuted(muted: boolean): void {
    this.settings.isMuted = muted;
    if (muted) {
      this.stopBackgroundMusic();
    } else {
      this.startBackgroundMusic();
    }
    this.saveSettings();
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  private saveSettings(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pool_audio_settings', JSON.stringify(this.settings));
    }
  }

  private loadSettings(): void {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('pool_audio_settings');
        if (saved) {
          this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
      } catch (error) {
        console.warn('Failed to load audio settings:', error);
      }
    }
  }

  // Convenience methods for common game sounds
  public playBallCollision(): void {
    this.playSound('ball_collision', 0.6);
  }

  public playBallPocket(): void {
    this.playSound('ball_pocket', 0.8);
  }

  public playCueShot(power: number): void {
    this.playSound('cue_shot', Math.min(1, power / 100));
  }

  public playMatchStart(): void {
    this.playSound('match_start', 1.0);
  }

  public playMatchWin(): void {
    this.playSound('match_win', 1.0);
  }

  public playMatchLose(): void {
    this.playSound('match_lose', 0.8);
  }

  public playButtonClick(): void {
    this.playSound('button_click', 0.4);
  }

  public playNotification(): void {
    this.playSound('notification', 0.6);
  }

  public playCoinSound(type: 'deposit' | 'withdraw'): void {
    this.playSound(type === 'deposit' ? 'coin_deposit' : 'coin_withdraw', 0.8);
  }

  public playTimerWarning(): void {
    this.playSound('timer_warning', 0.8);
  }

  public playCountdown(): void {
    this.playSound('countdown', 0.6);
  }

  // Initialize audio on first user interaction
  public async initializeOnUserGesture(): Promise<void> {
    if (!this.isInitialized && this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('Audio context resumed');
      } catch (error) {
        console.warn('Failed to resume audio context:', error);
      }
    }
  }
}