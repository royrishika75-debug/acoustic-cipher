import React from 'react';
import { Sparkles, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { CalibrationResult } from '../types';

interface CalibrationPanelProps {
  result: CalibrationResult | null;
  isCalibrating: boolean;
  onRunCalibration: () => void;
  onApplyRecommendedThreshold: (threshold: number) => void;
  isMicActive: boolean;
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({
  result,
  isCalibrating,
  onRunCalibration,
  onApplyRecommendedThreshold,
  isMicActive,
}) => {
  return (
    <div
      id="calibration-panel"
      className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 sm:p-5 flex flex-col gap-3.5 sm:gap-4 font-mono text-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#1e293b] pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-bold text-white tracking-wider uppercase text-xs sm:text-sm">
            HARDWARE CAPABILITY & NOISE CALIBRATION
          </span>
        </div>
        <button
          id="btn-run-calibration-inner"
          type="button"
          disabled={!isMicActive || isCalibrating}
          onClick={onRunCalibration}
          className={`min-h-[40px] px-3.5 py-2 rounded font-bold transition flex items-center justify-center gap-1.5 touch-manipulation ${
            isMicActive
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 hover:bg-cyan-500/30 active:bg-cyan-500/40 cursor-pointer'
              : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
          }`}
        >
          {isCalibrating ? 'ANALYZING NOISE FLOOR...' : 'CALIBRATE NOW'}
        </button>
      </div>

      {!result && !isCalibrating && (
        <div className="text-slate-400 text-xs leading-relaxed">
          {isMicActive ? (
            <span>
              Click <strong>CALIBRATE NOW</strong> to sample the ambient ultrasonic noise floor and verify
              whether your microphone hardware transducer passes high-frequency audio (18–19 kHz).
            </span>
          ) : (
            <span className="text-amber-400">
              Please start the microphone first before initiating calibration.
            </span>
          )}
        </div>
      )}

      {isCalibrating && (
        <div className="p-3.5 sm:p-4 bg-[#080d14] border border-cyan-500/40 rounded flex items-center gap-3 text-cyan-300 animate-pulse text-xs">
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
          <span>Sampling ambient spectral response across 18,000 Hz and 19,000 Hz bands...</span>
        </div>
      )}

      {result && !isCalibrating && (
        <div className="flex flex-col gap-3">
          {/* Warning Message if any */}
          {result.warningMessage && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/60 rounded text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <div className="font-bold">HARDWARE WARNING:</div>
                <div className="text-[11px] mt-0.5">{result.warningMessage}</div>
              </div>
            </div>
          )}

          {/* Results table */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 18 kHz Status */}
            <div className="bg-[#080d14] border border-[#1e293b] p-3 rounded flex flex-col gap-1">
              <div className="text-slate-400 text-[10px] sm:text-[11px]">18 kHz CHANNEL:</div>
              <div
                className={`text-sm sm:text-base font-bold flex items-center gap-1.5 ${
                  result.is18kDetectable ? 'text-cyan-300' : 'text-rose-400'
                }`}
              >
                {result.is18kDetectable ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" /> DETECTABLE
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" /> NOT DETECTABLE
                  </>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Ambient Noise Floor: {result.noiseFloor18k.toFixed(1)} dB
              </div>
            </div>

            {/* 19 kHz Status */}
            <div className="bg-[#080d14] border border-[#1e293b] p-3 rounded flex flex-col gap-1">
              <div className="text-slate-400 text-[10px] sm:text-[11px]">19 kHz CHANNEL:</div>
              <div
                className={`text-sm sm:text-base font-bold flex items-center gap-1.5 ${
                  result.is19kDetectable ? 'text-cyan-300' : 'text-rose-400'
                }`}
              >
                {result.is19kDetectable ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" /> DETECTABLE
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" /> NOT DETECTABLE
                  </>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Ambient Noise Floor: {result.noiseFloor19k.toFixed(1)} dB
              </div>
            </div>
          </div>

          {/* Recommended Threshold recommendation */}
          <div className="p-3.5 bg-[#080d14] border border-[#1e293b] rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-slate-300 font-semibold text-xs sm:text-sm">
                Calibrated Detection Threshold: <span className="text-cyan-400">{result.recommendedThreshold} dB</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Calculated +8 dB above ambient room noise floor for reliable SNR.
              </div>
            </div>

            <button
              type="button"
              onClick={() => onApplyRecommendedThreshold(result.recommendedThreshold)}
              className="min-h-[40px] w-full sm:w-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-300 text-black font-bold rounded text-xs transition cursor-pointer flex items-center justify-center touch-manipulation"
            >
              APPLY THRESHOLD
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
