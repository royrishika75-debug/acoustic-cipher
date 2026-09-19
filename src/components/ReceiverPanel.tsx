import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Sliders, ShieldAlert, Sparkles, RotateCcw, AlertTriangle, Cpu } from 'lucide-react';
import { AudioReceiver } from '../dsp/audioReceiver';
import { AVAILABLE_FFT_SIZES } from '../dsp/constants';
import { FftConfig, ReceiverDetection } from '../types';

interface ReceiverPanelProps {
  receiver?: AudioReceiver;
  detection?: ReceiverDetection;
  config: FftConfig;
  onConfigChange: (config: Partial<FftConfig>) => void;
  onRunCalibration: () => void;
  isCalibrating: boolean;
  sampleRate?: number;
  onAnalyserNodeChange?: (analyser: AnalyserNode | null, sampleRate: number, isConnected: boolean) => void;
}

interface DetailedError {
  friendly: string;
  name: string;
  message: string;
}

export const ReceiverPanel: React.FC<ReceiverPanelProps> = ({
  receiver,
  detection,
  config,
  onConfigChange,
  onRunCalibration,
  isCalibrating,
  sampleRate: initialSampleRate,
  onAnalyserNodeChange,
}) => {
  // Persistent refs for audio graph lifecycle (Req 5)
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const floatDataRef = useRef<Float32Array | null>(null);
  const isMicRunningRef = useRef<boolean>(false);

  // Stable callback and prop refs to prevent effect recreation & cleanup cascade
  const onAnalyserNodeChangeRef = useRef(onAnalyserNodeChange);
  onAnalyserNodeChangeRef.current = onAnalyserNodeChange;

  const receiverRef = useRef(receiver);
  receiverRef.current = receiver;

  // UI state
  const [micConnected, setMicConnected] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<'GRANTED' | 'DENIED' | 'UNKNOWN'>('UNKNOWN');
  const [audioContextState, setAudioContextState] = useState<'RUNNING' | 'SUSPENDED' | 'CLOSED'>('CLOSED');
  const [activeSampleRate, setActiveSampleRate] = useState<number>(initialSampleRate || 0);
  const [currentFftSize, setCurrentFftSize] = useState<number>(config.fftSize || 4096);
  const [activeTracksCount, setActiveTracksCount] = useState<number>(0);
  const [lastError, setLastError] = useState<DetailedError | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Raw continuous measured energy state (Req 11 & debug mode)
  const [rawEnergy8k, setRawEnergy8k] = useState<number>(-115);
  const [rawEnergy12k, setRawEnergy12k] = useState<number>(-115);
  const [rawEnergy18k, setRawEnergy18k] = useState<number>(-115);

  /**
   * Safe band energy measurement without allocations
   */
  const measureBandPeak = useCallback((
    centerFreq: number,
    halfWidth: number,
    data: Float32Array,
    binResolution: number,
    binCount: number
  ): number => {
    if (!data || binResolution <= 0 || binCount <= 0) return -115;
    const fLow = Math.max(0, centerFreq - halfWidth);
    const fHigh = centerFreq + halfWidth;
    const startBin = Math.max(0, Math.floor(fLow / binResolution));
    const endBin = Math.min(binCount - 1, Math.ceil(fHigh / binResolution));

    if (startBin >= endBin || startBin >= binCount) return -115;

    let peak = -115;
    for (let i = startBin; i <= endBin; i++) {
      const db = data[i];
      if (db > peak) {
        peak = db;
      }
    }
    return peak;
  }, []);

  /**
   * Stop microphone and safely tear down all audio resources (Req 8)
   */
  const stopMicrophone = useCallback(() => {
    const wasRunning = isMicRunningRef.current;
    isMicRunningRef.current = false;

    try {
      // 1. Cancel animation frame
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }

      // 2. Disconnect source node
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch (e) {
          console.warn('Safe cleanup: source node disconnect notice:', e);
        }
        sourceNodeRef.current = null;
      }

      // 3. Disconnect analyser
      if (analyserNodeRef.current) {
        try {
          analyserNodeRef.current.disconnect();
        } catch (e) {
          console.warn('Safe cleanup: analyser disconnect notice:', e);
        }
        analyserNodeRef.current = null;
      }

      // 4. Stop all MediaStream tracks
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (trackErr) {
              console.warn('Safe cleanup: track stop notice:', trackErr);
            }
          });
        } catch (streamErr) {
          console.warn('Safe cleanup: stream tracks notice:', streamErr);
        }
        streamRef.current = null;
      }

      // 5. Close AudioContext
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
        } catch (ctxErr) {
          console.warn('Safe cleanup: audio context close notice:', ctxErr);
        }
        audioContextRef.current = null;
      }

      floatDataRef.current = null;

      // 6. If legacy receiver prop was provided, stop it too
      if (receiverRef.current && typeof receiverRef.current.stopMicrophone === 'function') {
        try {
          receiverRef.current.stopMicrophone();
        } catch (recErr) {
          console.warn('Safe cleanup: legacy receiver stop notice:', recErr);
        }
      }

      // 7. Update UI to MICROPHONE STOPPED
      setMicConnected(false);
      setAudioContextState('CLOSED');
      setActiveTracksCount(0);
      setRawEnergy8k(-115);
      setRawEnergy12k(-115);
      setRawEnergy18k(-115);

      if (wasRunning) {
        onAnalyserNodeChangeRef.current?.(null, 0, false);
      }
    } catch (cleanupErr) {
      console.error('Safe cleanup error during stopMicrophone:', cleanupErr);
      setMicConnected(false);
      setAudioContextState('CLOSED');
    }
  }, []);

  /**
   * Safe analysis loop with invariant checking (Req 7)
   */
  const startAnalysisLoop = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    const loop = () => {
      // Req 7: The requestAnimationFrame loop must check that:
      // - analyser exists
      // - audio context exists
      // - microphone stream is active
      const analyser = analyserNodeRef.current;
      const audioCtx = audioContextRef.current;
      const stream = streamRef.current;

      if (!analyser || !audioCtx || !stream) {
        return; // Safely stop loop
      }

      // Check if tracks are still active
      const liveTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
      if (liveTracks.length === 0) {
        console.warn('Microphone tracks became inactive, stopping loop safely.');
        stopMicrophone();
        return;
      }

      try {
        const binCount = analyser.frequencyBinCount;
        if (!floatDataRef.current || floatDataRef.current.length !== binCount) {
          floatDataRef.current = new Float32Array(binCount);
        }
        const data = floatDataRef.current;
        analyser.getFloatFrequencyData(data);

        const sRate = audioCtx.sampleRate || 48000;
        const binResolution = sRate / (binCount * 2);

        // Continuous measured raw energy for 8 kHz, 12 kHz, and 18 kHz
        const e8 = measureBandPeak(8000, 300, data, binResolution, binCount);
        const e12 = measureBandPeak(12000, 300, data, binResolution, binCount);
        const e18 = measureBandPeak(18000, 300, data, binResolution, binCount);

        setRawEnergy8k(e8);
        setRawEnergy12k(e12);
        setRawEnergy18k(e18);

        // Periodically verify AudioContext state
        const currentState = (audioCtx.state?.toUpperCase() || 'RUNNING') as 'RUNNING' | 'SUSPENDED' | 'CLOSED';
        setAudioContextState(currentState);
      } catch (loopErr) {
        console.error('Safe loop frame error:', loopErr);
      }

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);
  }, [measureBandPeak, stopMicrophone]);

  /**
   * Start microphone with full error handling and lifecycle management (Req 1, 2, 3, 4, 5, 6)
   */
  const handleStartMic = async () => {
    setIsInitializing(true);
    setLastError(null);

    try {
      // 2. CHECK BROWSER SUPPORT FIRST (Req 2)
      if (typeof window === 'undefined') {
        const err = new Error('Microphone access is not supported in this browser/context.');
        err.name = 'NotSupportedError';
        throw err;
      }

      if (!navigator || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        const err = new Error('Microphone access is not supported in this browser/context.');
        err.name = 'NotSupportedError';
        throw err;
      }

      // Cleanup any previous session safely before initializing
      stopMicrophone();

      // 4. AUDIOCONTEXT LIFECYCLE (Req 4)
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        const err = new Error('Web Audio API is not supported in this browser/context.');
        err.name = 'NotSupportedError';
        throw err;
      }

      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      // Immediately call await audioContext.resume()
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (resumeErr) {
          console.warn('AudioContext resume warning:', resumeErr);
        }
      }

      const currentCtxState = (audioCtx.state?.toUpperCase() || 'RUNNING') as 'RUNNING' | 'SUSPENDED' | 'CLOSED';
      setAudioContextState(currentCtxState);
      const detectedSampleRate = audioCtx.sampleRate || 48000;
      setActiveSampleRate(detectedSampleRate);

      // 3. REQUEST MICROPHONE WITH CAREFUL CONSTRAINTS & PERMISSION (Req 1, 3)
      let stream: MediaStream;
      try {
        // Attempt raw audio without voice compression
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });
      } catch (constraintErr) {
        console.warn('Raw audio constraints unsupported, falling back to standard audio:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      streamRef.current = stream;
      setPermissionStatus('GRANTED');

      const liveTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
      setActiveTracksCount(liveTracks.length);

      // Handle unexpected track ending
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          console.warn('Microphone hardware track ended.');
          stopMicrophone();
        };
      });

      // 5. CREATE NODES IN PERSISTENT REFS (Req 5)
      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // 6. ANALYSER SETUP (Req 6)
      const analyser = audioCtx.createAnalyser();
      const validFftSize = config.fftSize && config.fftSize >= 256 ? config.fftSize : 4096;
      analyser.fftSize = validFftSize;
      analyser.smoothingTimeConstant = 0.0;
      analyser.minDecibels = -120;
      analyser.maxDecibels = 0;
      analyserNodeRef.current = analyser;
      setCurrentFftSize(validFftSize);

      source.connect(analyser);

      floatDataRef.current = new Float32Array(analyser.frequencyBinCount);
      isMicRunningRef.current = true;
      setMicConnected(true);
      setAudioContextState((audioCtx.state?.toUpperCase() || 'RUNNING') as 'RUNNING' | 'SUSPENDED' | 'CLOSED');

      // Notify parent/spectrum
      onAnalyserNodeChangeRef.current?.(analyser, detectedSampleRate, true);

      // 7. START REAL-TIME ANIMATION LOOP (Req 7)
      startAnalysisLoop();
    } catch (err: unknown) {
      isMicRunningRef.current = false;
      console.error('Microphone initialization caught error:', err);
      stopMicrophone();

      // 3. MAP ERROR ACCORDING TO SPECIFICATION (Req 3)
      const errorObj = err as Error;
      const errName = errorObj?.name || 'Error';
      const errMsg = errorObj?.message || String(err);

      let friendly = 'Microphone initialization failed.';
      let perm: 'GRANTED' | 'DENIED' | 'UNKNOWN' = 'UNKNOWN';

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('denied')
      ) {
        friendly = 'Microphone permission denied.';
        perm = 'DENIED';
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errMsg.toLowerCase().includes('device not found') ||
        errMsg.toLowerCase().includes('no microphone')
      ) {
        friendly = 'No microphone found.';
      } else if (
        errName === 'NotReadableError' ||
        errName === 'TrackStartError' ||
        errMsg.toLowerCase().includes('already in use') ||
        errMsg.toLowerCase().includes('could not start audio source')
      ) {
        friendly = 'Microphone is unavailable or already in use.';
      } else if (
        errName === 'NotSupportedError' ||
        errMsg.toLowerCase().includes('not supported')
      ) {
        friendly = 'Microphone access is not supported in this browser/context.';
      } else {
        friendly = errMsg || 'Microphone initialization failed.';
      }

      setPermissionStatus(perm);
      setLastError({
        friendly,
        name: errName,
        message: errMsg,
      });
      setMicConnected(false);
      setAudioContextState('CLOSED');
    } finally {
      setIsInitializing(false);
    }
  };

  /**
   * 9. COMPONENT UNMOUNT CLEANUP (Req 9)
   */
  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  // Use props values as fallback if receiver is passed
  const display8k = micConnected ? rawEnergy8k : (detection?.energy8k ?? -115);
  const display12k = micConnected ? rawEnergy12k : (detection?.energy12k ?? -115);
  const display18k = micConnected ? rawEnergy18k : (detection?.energy18k ?? -115);

  return (
    <div
      id="receiver-module"
      className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 sm:p-5 flex flex-col gap-4 sm:gap-5 font-mono"
    >
      {/* Header & Main Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-cyan-400 shrink-0" />
            ACOUSTICCIPHER RECEIVER
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-400 tracking-wider mt-0.5 break-words">
            ACOUSTIC MICROPHONE SENSOR & REAL-TIME SPECTRAL ANALYZER
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {!micConnected ? (
            <button
              id="btn-start-mic"
              type="button"
              disabled={isInitializing}
              onClick={handleStartMic}
              className="min-h-[44px] flex-1 sm:flex-none justify-center py-2.5 px-3.5 font-bold text-xs rounded border border-cyan-400 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 active:bg-cyan-500/40 transition cursor-pointer flex items-center gap-2 shadow-sm touch-manipulation"
            >
              <Mic className={`w-4 h-4 text-cyan-400 shrink-0 ${isInitializing ? 'animate-spin' : ''}`} />
              <span>{isInitializing ? 'CONNECTING...' : 'START MICROPHONE'}</span>
            </button>
          ) : (
            <button
              id="btn-stop-mic"
              type="button"
              onClick={stopMicrophone}
              className="min-h-[44px] flex-1 sm:flex-none justify-center py-2.5 px-3.5 font-bold text-xs rounded border border-red-500/40 bg-red-950/30 text-red-400 hover:bg-red-900/40 active:bg-red-900/60 transition cursor-pointer flex items-center gap-2 shadow-sm touch-manipulation"
            >
              <MicOff className="w-4 h-4 text-red-400 shrink-0" />
              <span>STOP MICROPHONE</span>
            </button>
          )}

          <button
            id="btn-calibrate-trigger"
            type="button"
            disabled={!micConnected || isCalibrating}
            onClick={onRunCalibration}
            className={`min-h-[44px] flex-1 sm:flex-none justify-center py-2.5 px-3 text-xs rounded border transition flex items-center gap-1.5 touch-manipulation ${
              micConnected
                ? 'border-slate-700 bg-[#0f172a] text-slate-200 hover:border-cyan-400 hover:text-cyan-300 active:bg-cyan-950/40 cursor-pointer'
                : 'border-[#1e293b] bg-transparent text-slate-600 cursor-not-allowed'
            }`}
            title={micConnected ? 'Calibrate baseline noise and hardware' : 'Start microphone first to calibrate'}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>{isCalibrating ? 'CALIBRATING...' : 'CALIBRATE'}</span>
          </button>
        </div>
      </div>

      {/* 10. ERROR BOUNDARY / SAFE ERROR UI (Req 10) */}
      {lastError && (
        <div
          id="receiver-error-alert"
          className="p-3.5 sm:p-4 bg-red-950/40 border border-red-500/60 rounded flex flex-col gap-3 text-red-200 text-xs shadow-md"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 font-bold text-red-400 text-xs sm:text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
              <span>RECEIVER ERROR: {lastError.friendly}</span>
            </div>
            <button
              id="btn-retry-microphone"
              type="button"
              onClick={handleStartMic}
              className="min-h-[38px] px-3 py-1.5 bg-red-900/60 hover:bg-red-900 border border-red-500/60 text-white rounded font-bold transition flex items-center gap-1.5 cursor-pointer shadow touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RETRY MICROPHONE
            </button>
          </div>

          {/* Small DEBUG Section (Req 3) */}
          <div className="pt-2 border-t border-red-900/50 text-[11px] text-slate-300 flex flex-col gap-1 bg-red-950/30 p-2.5 rounded">
            <span className="font-bold text-red-300 uppercase tracking-wider text-[10px]">
              DEBUG INFORMATION
            </span>
            <div className="flex gap-2">
              <span className="text-slate-400">error.name:</span>
              <span className="text-red-300 font-bold">{lastError.name}</span>
            </div>
            <div className="flex gap-2 break-all">
              <span className="text-slate-400">error.message:</span>
              <span className="text-red-200">{lastError.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* 11. DIAGNOSTICS BAR (Req 11) */}
      <div
        id="receiver-diagnostics-bar"
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 bg-[#080d14] border border-[#1e293b] p-2.5 sm:p-3 rounded text-xs"
      >
        {/* Microphone */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0">
          <span className="text-[10px] text-slate-400 uppercase">Microphone:</span>
          <span
            className={`font-bold mt-1 flex items-center gap-1.5 ${
              micConnected ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                micConnected ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="truncate">{micConnected ? 'CONNECTED' : 'STOPPED'}</span>
          </span>
        </div>

        {/* Permission */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0 sm:border-l sm:border-[#1e293b] sm:pl-2.5">
          <span className="text-[10px] text-slate-400 uppercase">Permission:</span>
          <span
            className={`font-bold mt-1 truncate ${
              permissionStatus === 'GRANTED'
                ? 'text-emerald-400'
                : permissionStatus === 'DENIED'
                ? 'text-red-400'
                : 'text-slate-400'
            }`}
          >
            {permissionStatus}
          </span>
        </div>

        {/* AudioContext */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0 sm:border-l sm:border-[#1e293b] sm:pl-2.5">
          <span className="text-[10px] text-slate-400 uppercase">AudioContext:</span>
          <span
            className={`font-bold mt-1 truncate ${
              audioContextState === 'RUNNING'
                ? 'text-emerald-400'
                : audioContextState === 'SUSPENDED'
                ? 'text-amber-400'
                : 'text-slate-500'
            }`}
          >
            {audioContextState}
          </span>
        </div>

        {/* Sample Rate */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0 sm:border-l sm:border-[#1e293b] sm:pl-2.5">
          <span className="text-[10px] text-slate-400 uppercase">Sample Rate:</span>
          <span className="font-bold text-white mt-1 truncate">
            {activeSampleRate > 0 ? `${activeSampleRate.toLocaleString()} Hz` : '--'}
          </span>
        </div>

        {/* FFT Size */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0 sm:border-l sm:border-[#1e293b] sm:pl-2.5">
          <span className="text-[10px] text-slate-400 uppercase">FFT Size:</span>
          <span className="font-bold text-white mt-1">
            {currentFftSize}
          </span>
        </div>

        {/* Input Tracks */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0 sm:border-l sm:border-[#1e293b] sm:pl-2.5">
          <span className="text-[10px] text-slate-400 uppercase">Input Tracks:</span>
          <span className="font-bold text-white mt-1">
            {activeTracksCount}
          </span>
        </div>

        {/* Last Error */}
        <div className="flex flex-col bg-[#0b1017] p-2 rounded border border-[#1e293b]/60 sm:border-0 sm:bg-transparent sm:p-0 sm:border-l sm:border-[#1e293b] sm:pl-2.5 col-span-2 sm:col-span-3 md:col-span-1 lg:col-span-1">
          <span className="text-[10px] text-slate-400 uppercase">Last Error:</span>
          <span
            className={`font-bold mt-1 truncate ${
              lastError ? 'text-red-400' : 'text-slate-500'
            }`}
            title={lastError ? `${lastError.name}: ${lastError.message}` : 'NONE'}
          >
            {lastError ? lastError.name : 'NONE'}
          </span>
        </div>
      </div>

      {/* CONTINUOUS RAW MEASURED SPECTRAL ENERGIES */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1">
          <span className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
            CONTINUOUS RAW MEASURED VALUES (UNSMOOTHED)
          </span>
          <span className="text-[10px] text-slate-500">
            REAL FFT SPECTRUM BINS
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {/* 8 kHz Energy Card */}
          <div
            id="card-energy-8k"
            className={`p-3.5 sm:p-4 rounded border transition ${
              micConnected && display8k > -70
                ? 'border-emerald-400 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'border-[#1e293b] bg-[#080d14]'
            }`}
          >
            <div className="flex justify-between items-center text-slate-400 text-xs">
              <span className="font-bold text-emerald-400">8 kHz ENERGY</span>
              <span className="text-[10px]">Audible</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-2">
              {micConnected ? `${display8k.toFixed(1)} dB` : '-- dB'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              8 kHz energy:{' '}
              <span className="text-emerald-300 font-semibold">
                {micConnected ? `${Math.round(display8k)} dB` : '--'}
              </span>
            </div>
            {/* Live Visual Meter */}
            <div className="w-full h-2 bg-[#0b1017] border border-[#1e293b] rounded mt-3 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{
                  width: `${
                    micConnected
                      ? Math.max(0, Math.min(100, Math.round(((display8k - -115) / 95) * 100)))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* 12 kHz Energy Card */}
          <div
            id="card-energy-12k"
            className={`p-3.5 sm:p-4 rounded border transition ${
              micConnected && display12k > -75
                ? 'border-sky-400 bg-sky-950/20 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                : 'border-[#1e293b] bg-[#080d14]'
            }`}
          >
            <div className="flex justify-between items-center text-slate-400 text-xs">
              <span className="font-bold text-sky-400">12 kHz ENERGY</span>
              <span className="text-[10px]">Upper Audio</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-2">
              {micConnected ? `${display12k.toFixed(1)} dB` : '-- dB'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              12 kHz energy:{' '}
              <span className="text-sky-300 font-semibold">
                {micConnected ? `${Math.round(display12k)} dB` : '--'}
              </span>
            </div>
            {/* Live Visual Meter */}
            <div className="w-full h-2 bg-[#0b1017] border border-[#1e293b] rounded mt-3 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-75"
                style={{
                  width: `${
                    micConnected
                      ? Math.max(0, Math.min(100, Math.round(((display12k - -115) / 95) * 100)))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* 18 kHz Energy Card */}
          <div
            id="card-energy-18k"
            className={`p-3.5 sm:p-4 rounded border transition ${
              micConnected && display18k > -80
                ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                : 'border-[#1e293b] bg-[#080d14]'
            }`}
          >
            <div className="flex justify-between items-center text-slate-400 text-xs">
              <span className="font-bold text-cyan-400">18 kHz ENERGY</span>
              <span className="text-[10px]">Target Ultrasound</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-2">
              {micConnected ? `${display18k.toFixed(1)} dB` : '-- dB'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              18 kHz energy:{' '}
              <span className="text-cyan-300 font-semibold">
                {micConnected ? `${Math.round(display18k)} dB` : '--'}
              </span>
            </div>
            {/* Live Visual Meter */}
            <div className="w-full h-2 bg-[#0b1017] border border-[#1e293b] rounded mt-3 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-75"
                style={{
                  width: `${
                    micConnected
                      ? Math.max(0, Math.min(100, Math.round(((display18k - -115) / 95) * 100)))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Config Panel Toggle */}
      <div className="border-t border-[#1e293b] pt-3">
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="min-h-[40px] flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-300 transition cursor-pointer flex-wrap"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="font-semibold">{showConfig ? 'HIDE PARAMETERS' : 'CONFIGURABLE DETECTION PARAMETERS'}</span>
          <span className="text-[10px] text-slate-500">
            (Threshold: {config.detectionThreshold} dB, FFT: {config.fftSize})
          </span>
        </button>

        {showConfig && (
          <div className="mt-3 p-3.5 sm:p-4 bg-[#080d14] border border-[#1e293b] rounded grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 text-xs">
            {/* Detection Threshold */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-slate-300">
                <span>DETECTION_THRESHOLD:</span>
                <span className="text-cyan-400 font-bold">{config.detectionThreshold} dB</span>
              </div>
              <input
                id="cfg-threshold-slider"
                type="range"
                min="-90"
                max="-40"
                step="1"
                value={config.detectionThreshold}
                onChange={(e) => onConfigChange({ detectionThreshold: parseInt(e.target.value, 10) })}
                className="accent-cyan-400 cursor-pointer h-6 touch-manipulation"
              />
              <span className="text-[10px] text-slate-500">
                Lower = more sensitive; Higher = ignores room noise.
              </span>
            </div>

            {/* FFT Size */}
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-300">FFT_SIZE:</span>
              <select
                id="cfg-fft-size-select"
                value={config.fftSize}
                onChange={(e) => {
                  const sz = parseInt(e.target.value, 10);
                  onConfigChange({ fftSize: sz });
                  if (analyserNodeRef.current) {
                    try {
                      analyserNodeRef.current.fftSize = sz;
                      floatDataRef.current = new Float32Array(analyserNodeRef.current.frequencyBinCount);
                      setCurrentFftSize(sz);
                    } catch (e) {
                      console.warn('Could not update fftSize on analyser:', e);
                    }
                  }
                }}
                className="min-h-[38px] bg-[#0f172a] border border-[#334155] text-cyan-300 p-2 rounded cursor-pointer"
              >
                {AVAILABLE_FFT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} ({size / 2} bins)
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500">
                4096 gives ~11.7 Hz frequency bin precision at 48 kHz.
              </span>
            </div>

            {/* Frequency 0 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-300">FREQUENCY_0 (Hz):</span>
              <input
                id="cfg-freq0-input"
                type="number"
                step="50"
                value={config.frequency0}
                onChange={(e) => onConfigChange({ frequency0: parseInt(e.target.value, 10) || 18000 })}
                className="min-h-[38px] bg-[#0f172a] border border-[#334155] text-white p-2 rounded"
              />
            </div>

            {/* Frequency 1 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-300">FREQUENCY_1 (Hz):</span>
              <input
                id="cfg-freq1-input"
                type="number"
                step="50"
                value={config.frequency1}
                onChange={(e) => onConfigChange({ frequency1: parseInt(e.target.value, 10) || 19000 })}
                className="min-h-[38px] bg-[#0f172a] border border-[#334155] text-white p-2 rounded"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
