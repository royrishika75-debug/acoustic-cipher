import React, { useEffect, useRef, useState } from 'react';
import { FftConfig } from '../types';

interface SpectrumCanvasProps {
  analyserNode: AnalyserNode | null;
  sampleRate: number;
  config: FftConfig;
  isActive: boolean;
  detectedFreq: number | null;
}

export const SpectrumCanvas: React.FC<SpectrumCanvasProps> = ({
  analyserNode,
  sampleRate,
  config,
  isActive,
  detectedFreq,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoomUltrasonic, setZoomUltrasonic] = useState<boolean>(false);
  const floatDataRef = useRef<Float32Array | null>(null);
  const dimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Responsive ResizeObserver on canvas container element
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          dimensionsRef.current = {
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          };
        }
      }
    });

    resizeObserver.observe(container);

    // Initial measurement
    const initialRect = container.getBoundingClientRect();
    dimensionsRef.current = {
      width: Math.floor(initialRect.width),
      height: Math.floor(initialRect.height),
    };

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      try {
        const dpr = window.devicePixelRatio || 1;
        const width = dimensionsRef.current.width || canvas.clientWidth || 300;
        const height = dimensionsRef.current.height || canvas.clientHeight || 200;

        if (width <= 0 || height <= 0) {
          animId = requestAnimationFrame(render);
          return;
        }

        const targetCanvasWidth = Math.floor(width * dpr);
        const targetCanvasHeight = Math.floor(height * dpr);

        if (canvas.width !== targetCanvasWidth || canvas.height !== targetCanvasHeight) {
          canvas.width = targetCanvasWidth;
          canvas.height = targetCanvasHeight;
        }

        ctx.save();
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = '#080b10';
        ctx.fillRect(0, 0, width, height);

        // Grid lines & subtle border
        ctx.strokeStyle = '#15202b';
        ctx.lineWidth = 1;

        // Horizontal dB lines (-90dB, -70dB, -50dB, -30dB, -10dB)
        const dbSteps = [-90, -70, -50, -30, -10];
        const minDb = -100;
        const maxDb = -10;
        const dbRange = maxDb - minDb;

        ctx.fillStyle = '#475569';
        ctx.font = width < 400 ? '9px ui-monospace, monospace' : '10px ui-monospace, monospace';

        dbSteps.forEach((db) => {
          const y = height - ((db - minDb) / dbRange) * height;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.fillText(`${db} dB`, 4, y - 3);
        });

        // Threshold line
        const thresholdY = height - ((config.detectionThreshold - minDb) / dbRange) * height;
        ctx.strokeStyle = '#0284c7';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(width, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#38bdf8';
        const threshText = width < 450 ? `TH: ${config.detectionThreshold} dB` : `THRESHOLD: ${config.detectionThreshold} dB`;
        const textX = width < 380 ? width - 85 : width - 140;
        ctx.fillText(threshText, Math.max(60, textX), thresholdY - 4);

        if (!isActive || !analyserNode || sampleRate <= 0) {
          // Inactive placeholder
          ctx.fillStyle = '#64748b';
          ctx.font = width < 400 ? '11px ui-monospace, monospace' : '13px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SPECTRUM INACTIVE — MICROPHONE STOPPED', width / 2, height / 2);
          ctx.restore();
          animId = requestAnimationFrame(render);
          return;
        }

        const binCount = analyserNode.frequencyBinCount;
        const binResolution = sampleRate / (binCount * 2);

        if (!floatDataRef.current || floatDataRef.current.length !== binCount) {
          floatDataRef.current = new Float32Array(binCount);
        }
        const floatData = floatDataRef.current;
        analyserNode.getFloatFrequencyData(floatData);

        // Frequency bounds
        const nyquist = sampleRate / 2;
        const fMin = zoomUltrasonic ? 16000 : 0;
        const fMax = zoomUltrasonic ? 20500 : nyquist;
        const fSpan = fMax - fMin;

        const freqToX = (freq: number) => {
          return ((freq - fMin) / fSpan) * width;
        };

        // Draw Highlight bands for 8 kHz, 12 kHz, and 18 kHz
        const drawTargetBand = (targetFreq: number, label: string, color: string) => {
          const halfWidth = 300;
          const x1 = freqToX(targetFreq - halfWidth);
          const x2 = freqToX(targetFreq + halfWidth);
          const xCenter = freqToX(targetFreq);

          if (x2 >= 0 && x1 <= width) {
            ctx.fillStyle = color;
            ctx.fillRect(Math.max(0, x1), 0, Math.min(width, x2) - Math.max(0, x1), height);

            // Center line
            ctx.strokeStyle = color.replace('0.2', '0.85');
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xCenter, 0);
            ctx.lineTo(xCenter, height);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#e2e8f0';
            ctx.font = width < 400 ? '9px ui-monospace, monospace' : '10px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(label, Math.max(25, Math.min(width - 25, xCenter)), 13);
          }
        };

        drawTargetBand(8000, `8k`, 'rgba(16, 185, 129, 0.2)');
        drawTargetBand(12000, `12k`, 'rgba(14, 165, 233, 0.2)');
        drawTargetBand(18000, `18k`, 'rgba(6, 182, 212, 0.2)');

        // Frequency X-axis ticks
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.font = width < 400 ? '9px ui-monospace, monospace' : '10px ui-monospace, monospace';
        const tickStep = zoomUltrasonic ? (width < 450 ? 2000 : 1000) : (width < 450 ? 8000 : 4000);
        const firstTick = Math.ceil(fMin / tickStep) * tickStep;

        for (let f = firstTick; f <= fMax; f += tickStep) {
          const x = freqToX(f);
          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.fillText(`${(f / 1000).toFixed(0)}k`, x, height - 5);
        }

        // Draw real FFT spectrum curve
        ctx.beginPath();
        let started = false;

        const startBin = Math.max(0, Math.floor(fMin / binResolution));
        const endBin = Math.min(binCount - 1, Math.ceil(fMax / binResolution));

        for (let k = startBin; k <= endBin; k++) {
          const freq = k * binResolution;
          const x = freqToX(freq);
          const db = floatData[k];
          const clampedDb = Math.max(minDb, Math.min(maxDb, db));
          const y = height - ((clampedDb - minDb) / dbRange) * height;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // If a frequency is actively detected, draw a lock marker
        if (detectedFreq && detectedFreq >= fMin && detectedFreq <= fMax) {
          const detX = freqToX(detectedFreq);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(detX, 0);
          ctx.lineTo(detX, height);
          ctx.stroke();

          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(detX, 26, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${(detectedFreq / 1000).toFixed(2)} kHz`, detX, 40);
        }

        ctx.restore();
      } catch (err) {
        console.error('SpectrumCanvas render error:', err);
      } finally {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyserNode, sampleRate, config, isActive, detectedFreq, zoomUltrasonic]);

  return (
    <div id="live-spectrum-panel" className="bg-[#0b1017] border border-[#1e293b] rounded-lg p-3.5 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block animate-pulse shrink-0"></span>
          <span className="text-xs sm:text-sm font-semibold tracking-wider text-slate-200 uppercase font-mono">
            LIVE FREQUENCY SPECTRUM (REAL FFT)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-spectrum-zoom"
            type="button"
            onClick={() => setZoomUltrasonic(!zoomUltrasonic)}
            className="px-2.5 py-1.5 min-h-[36px] text-xs font-mono font-medium rounded border border-[#334155] text-cyan-300 hover:bg-[#1e293b] transition cursor-pointer flex items-center justify-center"
          >
            {zoomUltrasonic ? 'ZOOM: 16k–20.5k' : 'FULL SPECTRUM (0–Nyquist)'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-44 sm:h-56 md:h-64 bg-[#080b10] border border-[#1e293b] rounded overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          id="spectrum-canvas"
          className="w-full h-full block"
        />
      </div>

      <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-slate-400 flex-wrap gap-2">
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-400"></span>
            8.0 kHz
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500/30 border border-sky-400"></span>
            12.0 kHz
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-cyan-500/30 border border-cyan-400"></span>
            18.0 kHz
          </span>
        </div>
        <span className="text-slate-500">
          Resolution: {sampleRate > 0 && config.fftSize > 0 ? `${(sampleRate / config.fftSize).toFixed(2)} Hz/bin` : '--'}
        </span>
      </div>
    </div>
  );
};
