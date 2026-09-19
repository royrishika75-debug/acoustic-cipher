import { FftConfig } from '../types';

export const DEFAULT_FREQUENCY_0 = 18000;
export const DEFAULT_FREQUENCY_1 = 19000;
export const DEFAULT_DETECTION_THRESHOLD_DB = -65;
export const DEFAULT_FFT_SIZE = 4096;
export const DEFAULT_BANDWIDTH_HZ = 200; // ±200 Hz window around target

export const INITIAL_CONFIG: FftConfig = {
  frequency0: DEFAULT_FREQUENCY_0,
  frequency1: DEFAULT_FREQUENCY_1,
  detectionThreshold: DEFAULT_DETECTION_THRESHOLD_DB,
  fftSize: DEFAULT_FFT_SIZE,
  bandwidth: DEFAULT_BANDWIDTH_HZ,
};

export const AVAILABLE_FFT_SIZES = [1024, 2048, 4096, 8192, 16384];

// Minimum acceptable sample rate for 19 kHz:
// Nyquist criterion: sampleRate / 2 > 19000 => sampleRate > 38000.
// Standard rates are 44100 Hz (Nyquist 22050 Hz) or 48000 Hz (Nyquist 24000 Hz).
export const MIN_VIABLE_SAMPLERATE = 40000;
