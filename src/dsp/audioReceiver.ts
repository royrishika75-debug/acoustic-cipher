/**
 * AcousticCipher - Audio Receiver Engine
 * Analyzes live microphone input using Web Audio API FFT to detect
 * 18 kHz (Symbol 0) and 19 kHz (Symbol 1) tones transmitted through air.
 */

import {
  CalibrationResult,
  DiagnosticsData,
  FftConfig,
  ReceiverDetection,
  SignalQuality,
  SpectralMeasurement,
  SymbolValue,
} from '../types';
import { INITIAL_CONFIG, MIN_VIABLE_SAMPLERATE } from './constants';

export class AudioReceiver {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private config: FftConfig = { ...INITIAL_CONFIG };
  private floatFrequencyData: Float32Array = new Float32Array(0);

  private onDetectionCallback: ((detection: ReceiverDetection) => void) | null = null;
  private onDiagnosticsCallback: ((diag: DiagnosticsData) => void) | null = null;

  private isRunning: boolean = false;
  private lastDetectionTime: number = 0;

  constructor(
    config?: Partial<FftConfig>,
    onDetection?: (detection: ReceiverDetection) => void,
    onDiagnostics?: (diag: DiagnosticsData) => void
  ) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    if (onDetection) this.onDetectionCallback = onDetection;
    if (onDiagnostics) this.onDiagnosticsCallback = onDiagnostics;
  }

  public setConfig(newConfig: Partial<FftConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.analyserNode && newConfig.fftSize && this.analyserNode.fftSize !== newConfig.fftSize) {
      this.analyserNode.fftSize = newConfig.fftSize;
      this.floatFrequencyData = new Float32Array(this.analyserNode.frequencyBinCount);
    }
  }

  public getConfig(): FftConfig {
    return { ...this.config };
  }

  public getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Request microphone stream with uncompressed, non-processed audio constraints
   * to ensure ultrasonic / high-frequency components (>16 kHz) are not suppressed
   * by browser voice filters.
   */
  public async startMicrophone(): Promise<{ success: boolean; sampleRate: number; error?: string }> {
    if (this.isRunning) {
      return { success: true, sampleRate: this.audioCtx?.sampleRate || 0 };
    }

    try {
      // First attempt: Request raw microphone input without speech post-processing
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });
      } catch (errConstraint) {
        console.warn('Strict raw audio constraints rejected, falling back to default mic:', errConstraint);
        // Fallback to standard audio permission
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.mediaStream = stream;

      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(stream);

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = this.config.fftSize;
      // Set to 0 for raw instantaneous measurement without temporal smoothing
      this.analyserNode.smoothingTimeConstant = 0;
      this.analyserNode.minDecibels = -120;
      this.analyserNode.maxDecibels = 0;

      this.sourceNode.connect(this.analyserNode);

      this.floatFrequencyData = new Float32Array(this.analyserNode.frequencyBinCount);
      this.isRunning = true;

      // Start the real-time DSP analysis loop
      this.startProcessingLoop();

      return {
        success: true,
        sampleRate: this.audioCtx.sampleRate,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown microphone error';
      this.stopMicrophone();
      return {
        success: false,
        sampleRate: 0,
        error: msg,
      };
    }
  }

  public stopMicrophone() {
    this.isRunning = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.analyserNode = null;

    // Emit zero/idle status to listeners
    if (this.onDetectionCallback) {
      this.onDetectionCallback({
        detectedSymbol: 'NONE',
        detectedFrequency: null,
        signalStrengthPercent: 0,
        signalQuality: 'NONE',
        energy8k: -115,
        energy12k: -115,
        energy18k: -115,
        energy19k: -115,
        noiseFloor: -115,
        rawPeak8kFreq: 0,
        rawPeak12kFreq: 0,
        rawPeak18kFreq: 0,
      });
    }

    if (this.onDiagnosticsCallback) {
      this.onDiagnosticsCallback({
        micConnected: false,
        audioContextState: 'uninitialized',
        samplingRate: 0,
        fftSize: this.config.fftSize,
        energy8k: -115,
        energy12k: -115,
        energy18k: -115,
        energy19k: -115,
        detectedSymbol: 'NONE',
        signalQuality: 'NONE',
        nyquistFrequency: 0,
        isNyquistAdequate: false,
        nyquistWarning: null,
      });
    }
  }

  /**
   * Main real-time DSP analysis loop executed on every animation frame.
   */
  private startProcessingLoop() {
    const processFrame = () => {
      if (!this.isRunning || !this.analyserNode || !this.audioCtx) {
        return;
      }

      this.analyserNode.getFloatFrequencyData(this.floatFrequencyData);
      const sampleRate = this.audioCtx.sampleRate;
      const binCount = this.analyserNode.frequencyBinCount;
      const binResolution = sampleRate / (binCount * 2);

      // Measure RAW spectral energies around 8 kHz, 12 kHz, and 18 kHz
      const meas8k = this.measureBandEnergy(8000, 150, binResolution, binCount);
      const meas12k = this.measureBandEnergy(12000, 150, binResolution, binCount);
      const meas18k = this.measureBandEnergy(18000, 150, binResolution, binCount);

      // RAW measured values (peak dB in band) without temporal smoothing
      const energy8k = meas8k.peakDb;
      const energy12k = meas12k.peakDb;
      const energy18k = meas18k.peakDb;

      // Also compute adjacent ultrasonic noise floor
      const noiseFloorMeas = this.measureBandEnergy(
        17450,
        150,
        binResolution,
        binCount
      );
      const noiseFloor = noiseFloorMeas.averageDb;

      const nyquist = sampleRate / 2;
      const isNyquistAdequate = nyquist >= 18000;
      const nyquistWarning = !isNyquistAdequate
        ? `Sample rate (${sampleRate} Hz) is insufficient for 18 kHz. Nyquist limit is ${nyquist} Hz.`
        : null;

      // Dispatch RAW measured values continuously
      if (this.onDetectionCallback) {
        this.onDetectionCallback({
          energy8k,
          energy12k,
          energy18k,
          detectedSymbol: 'NONE',
          detectedFrequency: null,
          signalStrengthPercent: 0,
          signalQuality: 'NONE',
          noiseFloor,
          rawPeak8kFreq: meas8k.exactPeakFreq,
          rawPeak12kFreq: meas12k.exactPeakFreq,
          rawPeak18kFreq: meas18k.exactPeakFreq,
          audioContextState: this.audioCtx.state,
        });
      }

      if (this.onDiagnosticsCallback) {
        this.onDiagnosticsCallback({
          micConnected: true,
          audioContextState: this.audioCtx.state,
          samplingRate: sampleRate,
          fftSize: this.config.fftSize,
          energy8k,
          energy12k,
          energy18k,
          energy19k: -115,
          detectedSymbol: 'NONE',
          signalQuality: 'NONE',
          nyquistFrequency: nyquist,
          isNyquistAdequate,
          nyquistWarning,
        });
      }

      this.animFrameId = requestAnimationFrame(processFrame);
    };

    this.animFrameId = requestAnimationFrame(processFrame);
  }

  /**
   * Measures spectral energy in a window [centerFreq - bandwidth, centerFreq + bandwidth].
   * Uses quadratic parabolic peak interpolation to accurately estimate sub-bin peak frequency.
   */
  private measureBandEnergy(
    centerFreq: number,
    bandwidth: number,
    binResolution: number,
    binCount: number
  ): SpectralMeasurement {
    const fLow = centerFreq - bandwidth;
    const fHigh = centerFreq + bandwidth;

    const startBin = Math.max(0, Math.floor(fLow / binResolution));
    const endBin = Math.min(binCount - 1, Math.ceil(fHigh / binResolution));

    if (startBin >= endBin || startBin >= binCount) {
      return {
        frequency: centerFreq,
        peakDb: -105,
        averageDb: -105,
        exactPeakFreq: centerFreq,
      };
    }

    let peakDb = -105;
    let peakBin = startBin;
    let sumLinearPower = 0;
    let count = 0;

    for (let k = startBin; k <= endBin; k++) {
      const db = this.floatFrequencyData[k];
      if (db > peakDb) {
        peakDb = db;
        peakBin = k;
      }
      // Linear power representation
      sumLinearPower += Math.pow(10, db / 10);
      count++;
    }

    const averageLinearPower = count > 0 ? sumLinearPower / count : 1e-10;
    const averageDb = 10 * Math.log10(Math.max(1e-10, averageLinearPower));

    // Parabolic interpolation around peak bin for fractional bin accuracy:
    // p = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
    let exactPeakFreq = peakBin * binResolution;
    if (peakBin > 0 && peakBin < binCount - 1) {
      const alpha = this.floatFrequencyData[peakBin - 1];
      const beta = this.floatFrequencyData[peakBin];
      const gamma = this.floatFrequencyData[peakBin + 1];
      const denom = alpha - 2 * beta + gamma;
      if (Math.abs(denom) > 1e-6) {
        const p = (0.5 * (alpha - gamma)) / denom;
        if (Math.abs(p) <= 1) {
          exactPeakFreq = (peakBin + p) * binResolution;
        }
      }
    }

    return {
      frequency: centerFreq,
      peakDb,
      averageDb,
      exactPeakFreq,
    };
  }

  /**
   * Run hardware calibration to test microphone frequency response and noise floor.
   */
  public async runCalibration(): Promise<CalibrationResult> {
    if (!this.isRunning || !this.audioCtx || !this.analyserNode) {
      throw new Error('Microphone must be active to perform calibration.');
    }

    const sampleRate = this.audioCtx.sampleRate;
    const nyquist = sampleRate / 2;
    const binCount = this.analyserNode.frequencyBinCount;
    const binResolution = sampleRate / (binCount * 2);

    const nyquistOk = nyquist > Math.max(this.config.frequency0, this.config.frequency1);

    // Sample noise floor over several frames
    const samplesCount = 15;
    let sum18k = 0;
    let sum19k = 0;

    for (let i = 0; i < samplesCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      this.analyserNode.getFloatFrequencyData(this.floatFrequencyData);
      const m0 = this.measureBandEnergy(this.config.frequency0, this.config.bandwidth, binResolution, binCount);
      const m1 = this.measureBandEnergy(this.config.frequency1, this.config.bandwidth, binResolution, binCount);
      sum18k += m0.peakDb;
      sum19k += m1.peakDb;
    }

    const noiseFloor18k = sum18k / samplesCount;
    const noiseFloor19k = sum19k / samplesCount;

    // Detectable if Nyquist is valid and the noise floor is not pinned at -Infinity or flat zero
    const is18kDetectable = nyquistOk && noiseFloor18k > -105 && noiseFloor18k < -10;
    const is19kDetectable = nyquistOk && noiseFloor19k > -105 && noiseFloor19k < -10;

    let warningMessage: string | null = null;
    if (!nyquistOk) {
      warningMessage = 'Selected frequency may not be reliably detectable at this sampling rate.';
    } else if (noiseFloor18k < -95 || noiseFloor19k < -95) {
      warningMessage = 'Microphone hardware appears to heavily attenuate frequencies above 17 kHz.';
    }

    // Recommended threshold: 8 dB above baseline noise floor, capped reasonably
    const highestNoise = Math.max(noiseFloor18k, noiseFloor19k);
    const recommendedThreshold = Math.max(-80, Math.min(-50, Math.round(highestNoise + 8)));

    return {
      sampleRate,
      nyquistOk,
      noiseFloor18k,
      noiseFloor19k,
      is18kDetectable,
      is19kDetectable,
      recommendedThreshold,
      warningMessage,
      timestamp: Date.now(),
    };
  }

  public destroy() {
    this.stopMicrophone();
  }
}
