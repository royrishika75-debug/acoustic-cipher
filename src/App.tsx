import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, Mic, Layers, ShieldCheck, Activity } from 'lucide-react';
import { AudioTransmitter } from './dsp/audioTransmitter';
import { AudioReceiver } from './dsp/audioReceiver';
import { INITIAL_CONFIG } from './dsp/constants';
import {
  CalibrationResult,
  DiagnosticsData,
  FftConfig,
  ReceiverDetection,
  TransmitterState,
} from './types';
import { TransmitterPanel } from './components/TransmitterPanel';
import { ReceiverPanel } from './components/ReceiverPanel';
import { SpectrumCanvas } from './components/SpectrumCanvas';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { CalibrationPanel } from './components/CalibrationPanel';
import { TestGuide } from './components/TestGuide';
import { ErrorBoundary } from './components/ErrorBoundary';

type AppMode = 'transmitter' | 'receiver' | 'dual';

export default function App() {
  const [mode, setMode] = useState<AppMode>('dual');
  const [config, setConfig] = useState<FftConfig>(INITIAL_CONFIG);

  const [txState, setTxState] = useState<TransmitterState>({
    isTransmitting: false,
    frequency: 0,
    symbol: 'NONE',
    volume: 0.9,
    oscillatorRunning: false,
  });

  const [detection, setDetection] = useState<ReceiverDetection>({
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

  const [diagnostics, setDiagnostics] = useState<DiagnosticsData>({
    micConnected: false,
    audioContextState: 'uninitialized',
    samplingRate: 0,
    fftSize: INITIAL_CONFIG.fftSize,
    energy8k: -115,
    energy12k: -115,
    energy18k: -115,
    energy19k: -115,
    detectedSymbol: 'NONE',
    signalQuality: 'NONE',
    nyquistFrequency: 0,
    isNyquistAdequate: true,
    nyquistWarning: null,
  });

  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [receiverAnalyserNode, setReceiverAnalyserNode] = useState<AnalyserNode | null>(null);
  const [receiverSampleRate, setReceiverSampleRate] = useState<number>(0);
  const [receiverMicActive, setReceiverMicActive] = useState<boolean>(false);

  const handleReceiverAnalyserChange = useCallback(
    (node: AnalyserNode | null, sRate: number, isConnected: boolean) => {
      setReceiverAnalyserNode((prev) => (prev === node ? prev : node));
      if (sRate > 0) {
        setReceiverSampleRate((prev) => (prev === sRate ? prev : sRate));
      }
      setReceiverMicActive((prev) => (prev === isConnected ? prev : isConnected));
      setDiagnostics((prev) => {
        const newRate = sRate > 0 ? sRate : prev.samplingRate;
        const newNyquist = sRate > 0 ? sRate / 2 : prev.nyquistFrequency;
        if (
          prev.micConnected === isConnected &&
          prev.samplingRate === newRate &&
          prev.nyquistFrequency === newNyquist
        ) {
          return prev;
        }
        return {
          ...prev,
          micConnected: isConnected,
          samplingRate: newRate,
          nyquistFrequency: newNyquist,
        };
      });
    },
    []
  );

  // Instantiate DSP engine singletons
  const transmitter = useMemo(() => {
    return new AudioTransmitter((newState) => {
      setTxState(newState);
    });
  }, []);

  const receiver = useMemo(() => {
    return new AudioReceiver(
      config,
      (newDetection) => setDetection(newDetection),
      (newDiag) => setDiagnostics(newDiag)
    );
  }, []);

  // Update receiver config when user adjusts parameters
  const handleConfigChange = useCallback(
    (partialConfig: Partial<FftConfig>) => {
      setConfig((prev) => {
        const updated = { ...prev, ...partialConfig };
        receiver.setConfig(updated);
        return updated;
      });
    },
    [receiver]
  );

  const handleRunCalibration = useCallback(async () => {
    if (!receiver.isActive()) return;
    setIsCalibrating(true);
    try {
      const result = await receiver.runCalibration();
      setCalibrationResult(result);
    } catch (err) {
      console.error('Calibration error:', err);
    } finally {
      setIsCalibrating(false);
    }
  }, [receiver]);

  const handleApplyThreshold = useCallback(
    (newThreshold: number) => {
      handleConfigChange({ detectionThreshold: newThreshold });
    },
    [handleConfigChange]
  );

  // Cleanup audio nodes on unmount
  useEffect(() => {
    return () => {
      transmitter.destroy();
      receiver.destroy();
    };
  }, [transmitter, receiver]);

  return (
    <div className="min-h-screen bg-[#070a0f] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Application Header */}
      <header className="border-b border-[#15202b] bg-[#090d14]/80 backdrop-blur sticky top-0 z-20 px-4 sm:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <h1 className="text-base sm:text-lg font-bold font-mono tracking-wider text-white">
              ACOUSTICCIPHER
            </h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/40 text-cyan-300">
              V1: SIGNAL ENGINE
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            OFFLINE PHYSICAL ACOUSTIC COMMUNICATION — SPEAKER ➔ AIR ➔ MICROPHONE
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center p-1 bg-[#0c121a] border border-[#1e293b] rounded-lg font-mono text-xs">
          <button
            id="tab-transmitter"
            type="button"
            onClick={() => setMode('transmitter')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'transmitter'
                ? 'bg-cyan-500 text-black font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            TRANSMITTER
          </button>

          <button
            id="tab-receiver"
            type="button"
            onClick={() => setMode('receiver')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'receiver'
                ? 'bg-cyan-500 text-black font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            RECEIVER
          </button>

          <button
            id="tab-dual"
            type="button"
            onClick={() => setMode('dual')}
            className={`px-3 py-1.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
              mode === 'dual'
                ? 'bg-cyan-500 text-black font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            DUAL BENCH
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Offline Air-Gap Verification Notice */}
        <div className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 flex items-center justify-between flex-wrap gap-2 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>
              AIR-GAP VALIDATION: Zero network transmission. No WebSockets, WebRTC, HTTP, or shared state.
            </span>
          </div>
          <span className="text-cyan-400 font-bold">100% AIR PROPAGATION</span>
        </div>

        {/* Primary Interactive Panels */}
        <div
          className={`grid gap-6 ${
            mode === 'dual'
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 max-w-3xl mx-auto w-full'
          }`}
        >
          {/* Transmitter Component */}
          {(mode === 'transmitter' || mode === 'dual') && (
            <div className="flex flex-col gap-6">
              <TransmitterPanel
                transmitter={transmitter}
                state={txState}
              />
            </div>
          )}

          {/* Receiver Component */}
          {(mode === 'receiver' || mode === 'dual') && (
            <div className="flex flex-col gap-6">
              <ErrorBoundary fallbackTitle="ACOUSTICCIPHER RECEIVER ERROR">
                <ReceiverPanel
                  receiver={receiver}
                  detection={detection}
                  config={config}
                  onConfigChange={handleConfigChange}
                  onRunCalibration={handleRunCalibration}
                  isCalibrating={isCalibrating}
                  sampleRate={receiverSampleRate || diagnostics.samplingRate}
                  onAnalyserNodeChange={handleReceiverAnalyserChange}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>

        {/* Live Spectrum Visualizer (always active for receiver data) */}
        {(mode === 'receiver' || mode === 'dual') && (
          <ErrorBoundary fallbackTitle="SPECTRUM VISUALIZER ERROR">
            <SpectrumCanvas
              analyserNode={receiverAnalyserNode || receiver.getAnalyserNode()}
              sampleRate={receiverSampleRate || diagnostics.samplingRate}
              config={config}
              isActive={receiverMicActive || diagnostics.micConnected}
              detectedFreq={detection.detectedFrequency}
            />
          </ErrorBoundary>
        )}

        {/* Hardware Diagnostics & Calibration Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DiagnosticPanel diagnostics={diagnostics} />

          <CalibrationPanel
            result={calibrationResult}
            isCalibrating={isCalibrating}
            onRunCalibration={handleRunCalibration}
            onApplyRecommendedThreshold={handleApplyThreshold}
            isMicActive={diagnostics.micConnected}
          />
        </div>

        {/* Test Guide & Hardware Reality */}
        <TestGuide />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#15202b] py-4 px-4 sm:px-8 text-center text-xs font-mono text-slate-500">
        AcousticCipher • Web Audio API Ultrasonic Signal Engine • Offline Air-Gap Protocol Prototype
      </footer>
    </div>
  );
}
