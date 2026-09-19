import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cpu } from 'lucide-react';
import { DiagnosticsData } from '../types';

interface DiagnosticPanelProps {
  diagnostics: DiagnosticsData;
}

export const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({ diagnostics }) => {
  return (
    <div
      id="diagnostic-panel"
      className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 sm:p-5 flex flex-col gap-3.5 sm:gap-4 font-mono text-xs"
    >
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 border-b border-[#1e293b] pb-2.5">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-bold text-white tracking-wider uppercase text-xs sm:text-sm">
            TECHNICAL DIAGNOSTICS
          </span>
        </div>
        <span className="text-[10px] text-slate-500">REAL-TIME DSP ENGINE TELEMETRY</span>
      </div>

      {/* Nyquist Hardware Reality Warning */}
      {diagnostics.nyquistWarning && (
        <div className="p-3 rounded bg-amber-950/40 border border-amber-500/50 text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-xs">HARDWARE / SAMPLING LIMITATION DETECTED</span>
            <span className="text-[11px] text-amber-200">{diagnostics.nyquistWarning}</span>
          </div>
        </div>
      )}

      {/* Diagnostics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Microphone */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">MICROPHONE:</span>
          <span
            className={`font-bold text-xs sm:text-sm flex items-center gap-1.5 ${
              diagnostics.micConnected ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            {diagnostics.micConnected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">CONNECTED</span>
              </>
            ) : (
              <span className="truncate">DISCONNECTED</span>
            )}
          </span>
        </div>

        {/* Audio Context */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">AUDIO CONTEXT:</span>
          <span
            className={`font-bold text-xs sm:text-sm uppercase truncate ${
              diagnostics.audioContextState === 'running'
                ? 'text-emerald-400'
                : 'text-slate-500'
            }`}
          >
            {diagnostics.audioContextState === 'running' ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>

        {/* Sampling Rate */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">SAMPLING RATE:</span>
          <span className="font-bold text-white text-xs sm:text-sm truncate">
            {diagnostics.samplingRate > 0
              ? `${diagnostics.samplingRate.toLocaleString()} Hz`
              : '--'}
          </span>
          {diagnostics.samplingRate > 0 && typeof diagnostics.nyquistFrequency === 'number' && (
            <span className="text-[9px] text-slate-500 truncate">
              Nyquist: {(diagnostics.nyquistFrequency / 1000).toFixed(1)} kHz
            </span>
          )}
        </div>

        {/* FFT Size */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">FFT SIZE:</span>
          <span className="font-bold text-white text-xs sm:text-sm">{diagnostics.fftSize}</span>
          <span className="text-[9px] text-slate-500 truncate">
            {diagnostics.fftSize / 2} bins
          </span>
        </div>

        {/* 18 kHz Energy */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">18 kHz ENERGY:</span>
          <span className="font-bold text-cyan-300 text-xs sm:text-sm truncate">
            {diagnostics.micConnected && typeof diagnostics.energy18k === 'number'
              ? `${diagnostics.energy18k.toFixed(2)} dB`
              : '--'}
          </span>
        </div>

        {/* 19 kHz Energy */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">19 kHz ENERGY:</span>
          <span className="font-bold text-sky-300 text-xs sm:text-sm truncate">
            {diagnostics.micConnected && typeof diagnostics.energy19k === 'number'
              ? `${diagnostics.energy19k.toFixed(2)} dB`
              : '--'}
          </span>
        </div>

        {/* Detected Symbol */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">DETECTED SYMBOL:</span>
          <span className="font-bold text-cyan-400 text-xs sm:text-sm truncate">
            {diagnostics.micConnected ? diagnostics.detectedSymbol : 'NONE'}
          </span>
        </div>

        {/* Signal Quality */}
        <div className="bg-[#080d14] border border-[#1e293b] p-2 sm:p-2.5 rounded flex flex-col gap-1">
          <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase truncate">SIGNAL QUALITY:</span>
          <span
            className={`font-bold text-xs sm:text-sm truncate ${
              diagnostics.signalQuality === 'STRONG'
                ? 'text-cyan-400'
                : diagnostics.signalQuality === 'GOOD'
                ? 'text-emerald-400'
                : diagnostics.signalQuality === 'WEAK'
                ? 'text-amber-400'
                : 'text-slate-500'
            }`}
          >
            {diagnostics.micConnected ? diagnostics.signalQuality : 'NONE'}
          </span>
        </div>
      </div>
    </div>
  );
};
