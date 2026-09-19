/**
 * AcousticCipher - Audio Transmitter Engine (Debugging & Calibration Mode)
 * Creates a continuous, persistent OscillatorNode that remains active indefinitely
 * until STOP is explicitly clicked.
 */

import { SymbolValue, TransmitterState } from '../types';

// Persistent module-level references so React re-renders or component unmounts
// NEVER recreate, interrupt, or stop the active oscillator.
let globalAudioCtx: AudioContext | null = null;
let globalOscillator: OscillatorNode | null = null;
let globalGain: GainNode | null = null;
let globalCurrentFreq = 0;
let globalIsPlaying = false;

export class AudioTransmitter {
  private onStateChange: ((state: TransmitterState) => void) | null = null;

  private state: TransmitterState = {
    isTransmitting: globalIsPlaying,
    frequency: globalCurrentFreq,
    symbol: 'NONE',
    volume: 0.9,
    oscillatorRunning: globalIsPlaying,
    audioContextState: globalAudioCtx?.state || 'uninitialized',
  };

  constructor(onStateChange?: (state: TransmitterState) => void) {
    if (onStateChange) {
      this.onStateChange = onStateChange;
    }
  }

  private async getAudioContext(): Promise<AudioContext> {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      globalAudioCtx = new AudioCtxClass();

      globalAudioCtx.onstatechange = () => {
        this.state.audioContextState = globalAudioCtx?.state;
        this.notifyState();
      };
    }

    if (globalAudioCtx.state === 'suspended') {
      await globalAudioCtx.resume();
    }

    this.state.audioContextState = globalAudioCtx.state;
    return globalAudioCtx;
  }

  public setVolume(vol: number) {
    this.state.volume = Math.max(0, Math.min(1, vol));
    if (globalGain && globalAudioCtx) {
      globalGain.gain.setValueAtTime(this.state.volume, globalAudioCtx.currentTime);
    }
    this.notifyState();
  }

  /**
   * Starts a continuous sine wave tone at the specified frequency.
   * Remains running indefinitely until stop() is explicitly called.
   * NO timeouts, NO automatic stops, NO interruption from re-renders.
   */
  public async playTone(frequency: number, symbol: SymbolValue = 'NONE') {
    const ctx = await this.getAudioContext();

    // If an oscillator is already running, gracefully disconnect and stop it
    this.stopToneInternal(false);

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Micro-ramp (0.005s) to eliminate harsh DC transient while starting immediately
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.state.volume, ctx.currentTime + 0.005);

      // Connect: Oscillator -> Gain -> Destination
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Start continuous oscillation — indefinitely running
      osc.start();

      globalOscillator = osc;
      globalGain = gain;
      globalCurrentFreq = frequency;
      globalIsPlaying = true;

      this.state.isTransmitting = true;
      this.state.frequency = frequency;
      this.state.symbol = symbol;
      this.state.oscillatorRunning = true;
      this.state.audioContextState = ctx.state;

      osc.onended = () => {
        if (globalOscillator === osc) {
          globalIsPlaying = false;
          globalCurrentFreq = 0;
          this.state.isTransmitting = false;
          this.state.frequency = 0;
          this.state.oscillatorRunning = false;
          this.notifyState();
        }
      };

      this.notifyState();
    } catch (err) {
      console.error('Failed to start continuous oscillator tone:', err);
    }
  }

  /**
   * Explicit user stop command.
   */
  public stop() {
    this.stopToneInternal(true);
  }

  private stopToneInternal(notify: boolean) {
    if (globalOscillator && globalGain && globalAudioCtx) {
      try {
        const now = globalAudioCtx.currentTime;
        globalGain.gain.cancelScheduledValues(now);
        globalGain.gain.setValueAtTime(0, now);
        globalOscillator.stop(now);
        globalOscillator.disconnect();
        globalGain.disconnect();
      } catch {
        // Node may already be stopped
      }
    }

    globalOscillator = null;
    globalGain = null;
    globalCurrentFreq = 0;
    globalIsPlaying = false;

    this.state.isTransmitting = false;
    this.state.frequency = 0;
    this.state.symbol = 'NONE';
    this.state.oscillatorRunning = false;
    this.state.audioContextState = globalAudioCtx?.state;

    if (notify) {
      this.notifyState();
    }
  }

  public getState(): TransmitterState {
    return {
      ...this.state,
      isTransmitting: globalIsPlaying,
      frequency: globalCurrentFreq,
      oscillatorRunning: globalIsPlaying,
      audioContextState: globalAudioCtx?.state || 'uninitialized',
    };
  }

  public getSamplingRate(): number {
    return globalAudioCtx ? globalAudioCtx.sampleRate : 0;
  }

  public getAudioContextState(): string {
    return globalAudioCtx ? globalAudioCtx.state : 'uninitialized';
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        ...this.state,
        isTransmitting: globalIsPlaying,
        frequency: globalCurrentFreq,
        oscillatorRunning: globalIsPlaying,
        audioContextState: globalAudioCtx?.state || 'uninitialized',
      });
    }
  }

  public destroy() {
    // Deliberately do not tear down global oscillator on React re-render unmounts
    // Only stop when explicitly instructed
  }
}

