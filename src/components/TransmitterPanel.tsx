import React from 'react';
import { Volume2, VolumeX, Radio, PowerOff, Activity } from 'lucide-react';
import { AudioTransmitter } from '../dsp/audioTransmitter';
import { TransmitterState } from '../types';

interface TransmitterPanelProps {
  transmitter: AudioTransmitter;
  state: TransmitterState;
}

export const TransmitterPanel: React.FC<TransmitterPanelProps> = ({
  transmitter,
  state,
}) => {
  const handlePlay8k = async () => {
    await transmitter.playTone(8000);
  };

  const handlePlay12k = async () => {
    await transmitter.playTone(12000);
  };

  const handlePlay18k = async () => {
    await transmitter.playTone(18000);
  };

  const handleStop = () => {
    transmitter.stop();
  };

  return (
    <div
      id="transmitter-module"
      className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 sm:p-5 flex flex-col gap-4 sm:gap-5"
    >
      {/* Header */}
      <div className="border-b border-[#1e293b] pb-3">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono flex items-center gap-2">
          <Radio className="w-5 h-5 text-cyan-400 shrink-0" />
          ACOUSTICCIPHER TRANSMITTER
        </h2>
        <p className="text-[10px] sm:text-xs text-slate-400 font-mono tracking-wider mt-0.5 break-words">
          CONTINUOUS HARDWARE TONE GENERATOR (DEBUG & FREQUENCY RESPONSE MODE)
        </p>
      </div>

      {/* Target Frequencies Reference */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
        <div
          className={`p-2 sm:p-3 rounded border font-mono transition ${
            state.isTransmitting && state.frequency === 8000
              ? 'bg-cyan-950/50 border-cyan-400 text-cyan-300 ring-1 ring-cyan-400'
              : 'bg-[#080d14] border-[#1e293b] text-slate-300'
          }`}
        >
          <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Test Band A</div>
          <div className="text-sm sm:text-base md:text-lg font-bold">8,000 Hz</div>
          <div className="text-[10px] sm:text-[11px] text-cyan-400 mt-0.5 font-semibold truncate">Audible ref</div>
        </div>

        <div
          className={`p-2 sm:p-3 rounded border font-mono transition ${
            state.isTransmitting && state.frequency === 12000
              ? 'bg-cyan-950/50 border-cyan-400 text-cyan-300 ring-1 ring-cyan-400'
              : 'bg-[#080d14] border-[#1e293b] text-slate-300'
          }`}
        >
          <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Test Band B</div>
          <div className="text-sm sm:text-base md:text-lg font-bold">12,000 Hz</div>
          <div className="text-[10px] sm:text-[11px] text-cyan-400 mt-0.5 font-semibold truncate">Upper audio</div>
        </div>

        <div
          className={`p-2 sm:p-3 rounded border font-mono transition ${
            state.isTransmitting && state.frequency === 18000
              ? 'bg-cyan-950/50 border-cyan-400 text-cyan-300 ring-1 ring-cyan-400'
              : 'bg-[#080d14] border-[#1e293b] text-slate-300'
          }`}
        >
          <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase truncate">Target Band C</div>
          <div className="text-sm sm:text-base md:text-lg font-bold">18,000 Hz</div>
          <div className="text-[10px] sm:text-[11px] text-cyan-400 mt-0.5 font-semibold truncate">Ultrasound</div>
        </div>
      </div>

      {/* Live Emitter Transmission Status */}
      <div
        id="transmitter-status-box"
        className={`p-3.5 sm:p-4 rounded border font-mono flex flex-col gap-2 transition-all ${
          state.isTransmitting
            ? 'bg-cyan-950/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
            : 'bg-[#080b10] border-[#1e293b]'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-1 text-xs">
          <span className="text-slate-400">TRANSMITTER STATUS:</span>
          {state.isTransmitting ? (
            <span className="text-cyan-400 font-bold flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              TRANSMITTING
            </span>
          ) : (
            <span className="text-slate-500 font-medium">IDLE</span>
          )}
        </div>

        <div className="flex items-baseline justify-between flex-wrap gap-1">
          <span className="text-slate-400 text-xs">FREQUENCY:</span>
          <span className="text-base sm:text-lg font-bold text-white tracking-wide">
            {state.isTransmitting ? `${state.frequency.toLocaleString()} Hz` : '--'}
          </span>
        </div>

        <div className="flex items-baseline justify-between flex-wrap gap-1">
          <span className="text-slate-400 text-xs">OSCILLATOR:</span>
          <span
            className={`text-xs sm:text-sm font-bold flex items-center gap-1 ${
              state.oscillatorRunning ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {state.oscillatorRunning ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>

        <div className="flex items-baseline justify-between text-[10px] sm:text-[11px] pt-1.5 border-t border-[#1e293b]/60">
          <span className="text-slate-500">AudioContext State:</span>
          <span className="text-slate-300 font-mono">
            {state.audioContextState || 'uninitialized'}
          </span>
        </div>

        {state.isTransmitting && (
          <div className="text-[10px] sm:text-[11px] text-cyan-300/80 font-mono mt-0.5">
            • Continuous oscillator active until STOP is pressed.
          </div>
        )}
      </div>

      {/* Primary Transmitter Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <button
          id="btn-play-8k"
          type="button"
          onClick={handlePlay8k}
          className={`min-h-[44px] py-2.5 sm:py-3 px-2 sm:px-3 font-mono font-bold text-[11px] sm:text-xs md:text-sm rounded border transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 touch-manipulation ${
            state.isTransmitting && state.frequency === 8000
              ? 'bg-cyan-500 text-black border-cyan-400 ring-2 ring-cyan-400'
              : 'bg-[#0f172a] text-cyan-300 border-cyan-500/50 hover:bg-cyan-950/40 hover:border-cyan-400 active:bg-cyan-500/30'
          }`}
        >
          <Radio className="w-3.5 h-3.5 shrink-0" />
          <span>PLAY 8 kHz</span>
        </button>

        <button
          id="btn-play-12k"
          type="button"
          onClick={handlePlay12k}
          className={`min-h-[44px] py-2.5 sm:py-3 px-2 sm:px-3 font-mono font-bold text-[11px] sm:text-xs md:text-sm rounded border transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 touch-manipulation ${
            state.isTransmitting && state.frequency === 12000
              ? 'bg-cyan-500 text-black border-cyan-400 ring-2 ring-cyan-400'
              : 'bg-[#0f172a] text-cyan-300 border-cyan-500/50 hover:bg-cyan-950/40 hover:border-cyan-400 active:bg-cyan-500/30'
          }`}
        >
          <Radio className="w-3.5 h-3.5 shrink-0" />
          <span>PLAY 12 kHz</span>
        </button>

        <button
          id="btn-play-18k"
          type="button"
          onClick={handlePlay18k}
          className={`min-h-[44px] py-2.5 sm:py-3 px-2 sm:px-3 font-mono font-bold text-[11px] sm:text-xs md:text-sm rounded border transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 touch-manipulation ${
            state.isTransmitting && state.frequency === 18000
              ? 'bg-cyan-500 text-black border-cyan-400 ring-2 ring-cyan-400'
              : 'bg-[#0f172a] text-cyan-300 border-cyan-500/50 hover:bg-cyan-950/40 hover:border-cyan-400 active:bg-cyan-500/30'
          }`}
        >
          <Radio className="w-3.5 h-3.5 shrink-0" />
          <span>PLAY 18 kHz</span>
        </button>

        <button
          id="btn-stop-tx"
          type="button"
          onClick={handleStop}
          className="min-h-[44px] py-2.5 sm:py-3 px-2 sm:px-3 font-mono font-bold text-[11px] sm:text-xs md:text-sm rounded border border-red-500/50 text-red-400 bg-[#160b0f] hover:bg-red-950/40 hover:border-red-400 active:bg-red-900/40 transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 touch-manipulation"
        >
          <PowerOff className="w-3.5 h-3.5 shrink-0" />
          <span>STOP</span>
        </button>
      </div>

      {/* Transmitter Output Volume */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#1e293b] text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          {state.volume === 0 ? (
            <VolumeX className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span>SPEAKER OUTPUT GAIN:</span>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            id="tx-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.volume}
            onChange={(e) => transmitter.setVolume(parseFloat(e.target.value))}
            className="accent-cyan-400 flex-1 sm:w-32 cursor-pointer h-6 touch-manipulation"
          />
          <span className="w-12 text-right text-white font-bold text-xs sm:text-sm">
            {Math.round(state.volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};

