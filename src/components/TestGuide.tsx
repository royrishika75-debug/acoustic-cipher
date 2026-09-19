import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Laptop, Check } from 'lucide-react';

export const TestGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <div
      id="test-guide-panel"
      className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 sm:p-5 font-mono text-xs text-slate-300"
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between font-bold text-white uppercase text-xs sm:text-sm tracking-wider cursor-pointer min-h-[40px] text-left gap-2 touch-manipulation"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="break-words">TWO-LAPTOP TESTING PROCEDURE & HARDWARE REALITY</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-4 flex flex-col gap-4 border-t border-[#1e293b] pt-4 leading-relaxed">
          {/* 2-Laptop Workflow */}
          <div className="bg-[#080d14] border border-[#1e293b] p-3 sm:p-4 rounded flex flex-col gap-2.5">
            <div className="font-bold text-cyan-400 flex items-center gap-2 text-xs sm:text-sm">
              <Laptop className="w-4 h-4 shrink-0" />
              <span>STEP-BY-STEP TWO-DEVICE PROCEDURE</span>
            </div>

            <ol className="list-decimal list-inside space-y-2.5 text-slate-300 text-[11px] sm:text-xs">
              <li>
                <strong className="text-white">Laptop A (Transmitter):</strong> Select{' '}
                <span className="text-cyan-300">TRANSMITTER</span> mode. Turn physical speaker volume
                to 70%–80%.
              </li>
              <li>
                <strong className="text-white">Laptop B (Receiver):</strong> Select{' '}
                <span className="text-cyan-300">RECEIVER</span> mode. Click{' '}
                <span className="text-cyan-300">[START MICROPHONE]</span> and grant browser mic permission.
              </li>
              <li>
                <strong className="text-white">Positioning:</strong> Place Laptop A's speaker within
                10–50 cm of Laptop B's microphone.
              </li>
              <li>
                <strong className="text-white">Test Symbol 0:</strong> On Laptop A, click{' '}
                <span className="text-cyan-300">[PLAY 8k / 18k]</span>.
                <br />
                <span className="text-slate-400 pl-4 sm:pl-5 inline-block mt-0.5">
                  → Transmitter emits selected frequency. Receiver displays live peak and energy reading in dB.
                </span>
              </li>
              <li>
                <strong className="text-white">Test Stop:</strong> On Laptop A, click{' '}
                <span className="text-red-400">[STOP]</span>.
                <br />
                <span className="text-slate-400 pl-4 sm:pl-5 inline-block mt-0.5">
                  → Transmitter stops emission. Receiver spectral display immediately drops back to room baseline.
                </span>
              </li>
            </ol>
          </div>

          {/* Hardware Reality & Diagnostics */}
          <div className="bg-[#080d14] border border-[#1e293b] p-3 sm:p-4 rounded flex flex-col gap-2">
            <div className="font-bold text-amber-400 text-xs sm:text-sm">HARDWARE LIMITATIONS & TROUBLESHOOTING</div>
            <ul className="list-disc list-inside space-y-2 text-slate-400 text-[11px] sm:text-xs">
              <li>
                <strong className="text-slate-200">Nyquist Criterion:</strong> The browser's audio sample rate
                must be at least 44,100 Hz (Nyquist: 22,050 Hz) or 48,000 Hz (Nyquist: 24,000 Hz). If a system is
                locked to 32 kHz, ultrasonic tones cannot be digitized.
              </li>
              <li>
                <strong className="text-slate-200">Acoustic Attenuation:</strong> Inexpensive laptop speakers and
                microphones have steep hardware low-pass roll-offs starting around 16–17 kHz. If signal is weak,
                increase the speaker volume slider or lower the <strong>DETECTION_THRESHOLD</strong> in config.
              </li>
              <li>
                <strong className="text-slate-200">Voice Processing Filters:</strong> This receiver explicitly
                requests raw audio constraints (<code>echoCancellation: false, noiseSuppression: false</code>) so
                the browser does not mistakenly filter ultrasonic tones as background noise.
              </li>
              <li>
                <strong className="text-slate-200">Single-Device Loopback Test:</strong> You can also test on a
                single machine by switching to <span className="text-cyan-300">DUAL BENCH</span> mode: start the
                microphone and play tones from the same machine to verify immediate acoustic loopback!
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
