export type SymbolValue = '0' | '1' | 'NONE';

export type SignalQuality = 'NONE' | 'WEAK' | 'GOOD' | 'STRONG';

export interface TransmitterState {
  isTransmitting: boolean;
  frequency: number; // in Hz
  symbol?: SymbolValue;
  volume: number; // 0 to 1
  oscillatorRunning: boolean;
  audioContextState?: string;
}

export interface FftConfig {
  frequency0: number; // default 18000 Hz
  frequency1: number; // default 19000 Hz
  detectionThreshold: number; // in dB, e.g. -65 dB
  fftSize: number; // 2048, 4096, 8192
  bandwidth: number; // bandwidth around target in Hz, e.g. 200 Hz
}

export interface SpectralMeasurement {
  frequency: number;
  peakDb: number;
  averageDb: number;
  exactPeakFreq: number; // interpolated
}

export interface ReceiverDetection {
  energy8k: number; // in dB (raw measured)
  energy12k: number; // in dB (raw measured)
  energy18k: number; // in dB (raw measured)
  energy19k?: number; // in dB
  detectedSymbol: SymbolValue;
  detectedFrequency: number | null; // in Hz
  signalStrengthPercent: number; // 0 - 100
  signalQuality: SignalQuality;
  noiseFloor: number; // in dB
  rawPeak8kFreq?: number;
  rawPeak12kFreq?: number;
  rawPeak18kFreq?: number;
  audioContextState?: string;
}

export interface DiagnosticsData {
  micConnected: boolean;
  audioContextState: 'suspended' | 'running' | 'closed' | 'uninitialized';
  samplingRate: number;
  fftSize: number;
  energy8k: number; // in dB
  energy12k: number; // in dB
  energy18k: number; // in dB
  energy19k?: number; // in dB
  detectedSymbol: SymbolValue;
  signalQuality: SignalQuality;
  nyquistFrequency: number;
  isNyquistAdequate: boolean;
  nyquistWarning: string | null;
}

export interface CalibrationResult {
  sampleRate: number;
  nyquistOk: boolean;
  noiseFloor18k: number;
  noiseFloor19k: number;
  is18kDetectable: boolean;
  is19kDetectable: boolean;
  recommendedThreshold: number;
  warningMessage: string | null;
  timestamp: number;
}
