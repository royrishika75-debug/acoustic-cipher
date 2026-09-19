/**
 * AcousticCipher - Standalone Vanilla JavaScript Signal Engine (Version 1)
 * Physical Acoustic Communication: Speaker -> Air -> Microphone
 * Zero backend, Zero WebSockets, Zero WebRTC, Pure Web Audio API
 */

// DSP Configuration Constants
const CONFIG = {
  FREQUENCY_0: 18000,
  FREQUENCY_1: 19000,
  DETECTION_THRESHOLD: -65, // in dB
  FFT_SIZE: 4096,
  BANDWIDTH: 200, // ±200 Hz around target
};

// ==========================================
// 1. TRANSMITTER ENGINE
// ==========================================
class Transmitter {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isTransmitting = false;
    this.activeFreq = 0;
    this.activeSymbol = 'NONE';
    this.volume = 0.9;
  }

  async getAudioContext() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async play(freq, symbol) {
    const ctx = await this.getAudioContext();
    this.stop(false);

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Micro-ramp (0.005s) to eliminate transient click while starting immediately
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.005);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      this.oscillator = osc;
      this.gainNode = gain;
      this.isTransmitting = true;
      this.activeFreq = freq;
      this.activeSymbol = symbol;

      this.updateUI();
    } catch (e) {
      console.error('Transmitter error:', e);
    }
  }

  stop(update = true) {
    if (this.oscillator && this.gainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.oscillator.stop(now);
        this.oscillator.disconnect();
        this.gainNode.disconnect();
      } catch (_) {}
    }

    this.oscillator = null;
    this.gainNode = null;
    this.isTransmitting = false;
    this.activeFreq = 0;
    this.activeSymbol = 'NONE';

    if (update) this.updateUI();
  }

  updateUI() {
    const statusBox = document.getElementById('tx-status-box');
    const statusText = document.getElementById('tx-status-text');
    const freqText = document.getElementById('tx-freq-text');
    const symbolText = document.getElementById('tx-symbol-text');

    if (this.isTransmitting) {
      statusBox.classList.add('active');
      statusText.textContent = 'TRANSMITTING';
      statusText.style.color = '#06b6d4';
      freqText.textContent = `${(this.activeFreq / 1000).toFixed(1)} kHz`;
      symbolText.textContent = this.activeSymbol;
    } else {
      statusBox.classList.remove('active');
      statusText.textContent = 'IDLE';
      statusText.style.color = '#94a3b8';
      freqText.textContent = '--';
      symbolText.textContent = '--';
    }
  }
}

// ==========================================
// 2. RECEIVER ENGINE
// ==========================================
class Receiver {
  constructor() {
    this.audioCtx = null;
    this.stream = null;
    this.sourceNode = null;
    this.analyser = null;
    this.isActive = false;
    this.floatData = null;
    this.animId = null;

    this.detectedSymbol = 'NONE';
    this.detectedFreq = null;
    this.energy0 = -100;
    this.energy1 = -100;
    this.signalQuality = 'NONE';
  }

  async start() {
    if (this.isActive) return;

    try {
      // Request raw audio without speech filters that cut off >15 kHz
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });
      } catch (_) {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.stream = mediaStream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = CONFIG.FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.4;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;

      this.sourceNode.connect(this.analyser);
      this.floatData = new Float32Array(this.analyser.frequencyBinCount);
      this.isActive = true;

      this.processLoop();
      this.updateDiagnostics();
    } catch (err) {
      alert('Microphone access denied or error: ' + err.message);
    }
  }

  stop() {
    this.isActive = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.detectedSymbol = 'NONE';
    this.detectedFreq = null;
    this.energy0 = -100;
    this.energy1 = -100;
    this.signalQuality = 'NONE';

    this.updateReceiverUI(0);
    this.updateDiagnostics();
  }

  processLoop() {
    if (!this.isActive || !this.analyser || !this.audioCtx) return;

    this.analyser.getFloatFrequencyData(this.floatData);
    const sampleRate = this.audioCtx.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const binRes = sampleRate / (binCount * 2);

    const m0 = this.measureBand(CONFIG.FREQUENCY_0, CONFIG.BANDWIDTH, binRes, binCount);
    const m1 = this.measureBand(CONFIG.FREQUENCY_1, CONFIG.BANDWIDTH, binRes, binCount);

    this.energy0 = m0.peakDb;
    this.energy1 = m1.peakDb;

    const threshold = CONFIG.DETECTION_THRESHOLD;
    const band0Above = this.energy0 >= threshold;
    const band1Above = this.energy1 >= threshold;

    let activeDb = -100;

    if (band0Above && (!band1Above || this.energy0 > this.energy1 + 2.5)) {
      this.detectedSymbol = '0';
      this.detectedFreq = m0.exactFreq;
      activeDb = this.energy0;
    } else if (band1Above && (!band0Above || this.energy1 > this.energy0 + 2.5)) {
      this.detectedSymbol = '1';
      this.detectedFreq = m1.exactFreq;
      activeDb = this.energy1;
    } else {
      this.detectedSymbol = 'NONE';
      this.detectedFreq = null;
    }

    let strength = 0;
    if (this.detectedSymbol !== 'NONE') {
      const delta = activeDb - threshold;
      if (delta >= 18) this.signalQuality = 'STRONG';
      else if (delta >= 8) this.signalQuality = 'GOOD';
      else this.signalQuality = 'WEAK';
      strength = Math.max(0, Math.min(100, Math.round(((activeDb - (threshold - 5)) / 30) * 100)));
    } else {
      this.signalQuality = 'NONE';
      const high = Math.max(this.energy0, this.energy1);
      if (high > threshold - 15) {
        strength = Math.max(0, Math.min(25, Math.round(((high - (threshold - 15)) / 15) * 25)));
      }
    }

    this.updateReceiverUI(strength);
    this.updateDiagnostics();

    this.animId = requestAnimationFrame(() => this.processLoop());
  }

  measureBand(centerFreq, bandwidth, binRes, binCount) {
    const fLow = centerFreq - bandwidth;
    const fHigh = centerFreq + bandwidth;
    const startBin = Math.max(0, Math.floor(fLow / binRes));
    const endBin = Math.min(binCount - 1, Math.ceil(fHigh / binRes));

    let peakDb = -100;
    let peakBin = startBin;

    for (let k = startBin; k <= endBin; k++) {
      const db = this.floatData[k];
      if (db > peakDb) {
        peakDb = db;
        peakBin = k;
      }
    }

    // Quadratic interpolation
    let exactFreq = peakBin * binRes;
    if (peakBin > 0 && peakBin < binCount - 1) {
      const a = this.floatData[peakBin - 1];
      const b = this.floatData[peakBin];
      const c = this.floatData[peakBin + 1];
      const d = a - 2 * b + c;
      if (Math.abs(d) > 1e-5) {
        const p = (0.5 * (a - c)) / d;
        if (Math.abs(p) <= 1) exactFreq = (peakBin + p) * binRes;
      }
    }

    return { peakDb, exactFreq };
  }

  updateReceiverUI(strength) {
    const rxStatus = document.getElementById('rx-status-text');
    const rxFreq = document.getElementById('rx-freq-text');
    const rxSymbol = document.getElementById('rx-symbol-text');
    const rxQuality = document.getElementById('rx-quality-text');
    const rxMeter = document.getElementById('rx-meter-fill');
    const rxMeterText = document.getElementById('rx-meter-text');
    const rxBox = document.getElementById('rx-status-box');

    if (!this.isActive) {
      rxStatus.textContent = 'STANDBY (MICROPHONE STOPPED)';
      rxStatus.style.color = '#94a3b8';
      rxFreq.textContent = '--';
      rxSymbol.textContent = 'NONE';
      rxQuality.textContent = 'NONE';
      rxMeter.style.width = '0%';
      rxMeterText.textContent = '0%';
      rxBox.classList.remove('active');
      return;
    }

    if (this.detectedSymbol !== 'NONE') {
      rxBox.classList.add('active');
      rxStatus.textContent = 'SIGNAL DETECTED';
      rxStatus.style.color = '#06b6d4';
      rxFreq.textContent = `${(this.detectedFreq / 1000).toFixed(2)} kHz`;
      rxSymbol.textContent = this.detectedSymbol;
      rxQuality.textContent = this.signalQuality;
    } else {
      rxBox.classList.remove('active');
      rxStatus.textContent = 'NO SIGNAL';
      rxStatus.style.color = '#eab308';
      rxFreq.textContent = 'NO SIGNAL';
      rxSymbol.textContent = 'NO SIGNAL';
      rxQuality.textContent = 'NONE';
    }

    rxMeter.style.width = `${strength}%`;
    rxMeterText.textContent = `${strength}%`;

    document.getElementById('energy-0-val').textContent = `${this.energy0.toFixed(1)} dB`;
    document.getElementById('energy-1-val').textContent = `${this.energy1.toFixed(1)} dB`;
  }

  updateDiagnostics() {
    const sRate = this.audioCtx ? this.audioCtx.sampleRate : 0;
    const nyquist = sRate / 2;

    document.getElementById('diag-mic').textContent = this.isActive ? 'CONNECTED' : 'NOT CONNECTED';
    document.getElementById('diag-mic').style.color = this.isActive ? '#06b6d4' : '#64748b';

    document.getElementById('diag-ctx').textContent = this.audioCtx && this.audioCtx.state === 'running' ? 'RUNNING' : 'STOPPED';
    document.getElementById('diag-srate').textContent = sRate > 0 ? `${sRate.toLocaleString()} Hz` : '--';
    document.getElementById('diag-fft').textContent = `${CONFIG.FFT_SIZE}`;
    document.getElementById('diag-e0').textContent = this.isActive ? `${this.energy0.toFixed(1)} dB` : '--';
    document.getElementById('diag-e1').textContent = this.isActive ? `${this.energy1.toFixed(1)} dB` : '--';
    document.getElementById('diag-sym').textContent = this.detectedSymbol;
    document.getElementById('diag-qual').textContent = this.signalQuality;

    const warnEl = document.getElementById('nyquist-warning');
    if (sRate > 0 && nyquist <= Math.max(CONFIG.FREQUENCY_0, CONFIG.FREQUENCY_1)) {
      warnEl.style.display = 'block';
      warnEl.textContent = 'Selected frequency may not be reliably detectable at this sampling rate (Nyquist: ' + nyquist + ' Hz).';
    } else {
      warnEl.style.display = 'none';
    }
  }

  async calibrate() {
    if (!this.isActive || !this.analyser) {
      alert('Start microphone before calibrating.');
      return;
    }

    const res18 = document.getElementById('calib-18k');
    const res19 = document.getElementById('calib-19k');
    res18.textContent = 'CALIBRATING...';
    res19.textContent = 'CALIBRATING...';

    const sRate = this.audioCtx.sampleRate;
    const nyquist = sRate / 2;
    const nyquistOk = nyquist > Math.max(CONFIG.FREQUENCY_0, CONFIG.FREQUENCY_1);

    await new Promise((r) => setTimeout(r, 600));

    res18.textContent = nyquistOk && this.energy0 > -95 ? 'DETECTABLE' : 'NOT DETECTABLE';
    res18.style.color = nyquistOk && this.energy0 > -95 ? '#06b6d4' : '#f43f5e';

    res19.textContent = nyquistOk && this.energy1 > -95 ? 'DETECTABLE' : 'NOT DETECTABLE';
    res19.style.color = nyquistOk && this.energy1 > -95 ? '#06b6d4' : '#f43f5e';

    const noiseMax = Math.max(this.energy0, this.energy1);
    const recThresh = Math.max(-80, Math.min(-50, Math.round(noiseMax + 8)));
    document.getElementById('calib-rec-thresh').textContent = `${recThresh} dB`;
  }
}

// ==========================================
// 3. LIVE SPECTRUM CANVAS RENDERER
// ==========================================
class SpectrumRenderer {
  constructor(canvas, receiver) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.receiver = receiver;
    this.start();
  }

  start() {
    const draw = () => {
      const w = this.canvas.width = this.canvas.offsetWidth;
      const h = this.canvas.height = this.canvas.offsetHeight;
      const ctx = this.ctx;

      // Dark background
      ctx.fillStyle = '#080b10';
      ctx.fillRect(0, 0, w, h);

      if (!this.receiver.isActive || !this.receiver.analyser) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SPECTRUM INACTIVE (MICROPHONE STOPPED)', w / 2, h / 2);
        requestAnimationFrame(draw);
        return;
      }

      const analyser = this.receiver.analyser;
      const binCount = analyser.frequencyBinCount;
      const sRate = this.receiver.audioCtx.sampleRate;
      const binRes = sRate / (binCount * 2);
      const data = this.receiver.floatData;

      // Frequencies 16 kHz to 20.5 kHz
      const fMin = 16000;
      const fMax = 20500;
      const span = fMax - fMin;
      const freqToX = (f) => ((f - fMin) / span) * w;

      // Highlight target bands
      const drawBand = (fTarget, label, color) => {
        const x1 = freqToX(fTarget - CONFIG.BANDWIDTH);
        const x2 = freqToX(fTarget + CONFIG.BANDWIDTH);
        ctx.fillStyle = color;
        ctx.fillRect(x1, 0, x2 - x1, h);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, freqToX(fTarget), 15);
      };

      drawBand(CONFIG.FREQUENCY_0, '18 kHz [0]', 'rgba(6, 182, 212, 0.15)');
      drawBand(CONFIG.FREQUENCY_1, '19 kHz [1]', 'rgba(14, 165, 233, 0.15)');

      // Threshold line
      const minDb = -100;
      const maxDb = -10;
      const threshY = h - ((CONFIG.DETECTION_THRESHOLD - minDb) / (maxDb - minDb)) * h;
      ctx.strokeStyle = '#0284c7';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, threshY);
      ctx.lineTo(w, threshY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw FFT Curve
      ctx.beginPath();
      let first = true;
      const startBin = Math.max(0, Math.floor(fMin / binRes));
      const endBin = Math.min(binCount - 1, Math.ceil(fMax / binRes));

      for (let k = startBin; k <= endBin; k++) {
        const freq = k * binRes;
        const x = freqToX(freq);
        const db = Math.max(minDb, Math.min(maxDb, data[k]));
        const y = h - ((db - minDb) / (maxDb - minDb)) * h;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
}

// ==========================================
// 4. BOOTSTRAP AND UI HOOKS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const transmitter = new Transmitter();
  const receiver = new Receiver();
  const canvas = document.getElementById('spectrum-canvas');
  new SpectrumRenderer(canvas, receiver);

  // Transmitter buttons
  document.getElementById('btn-play-0').addEventListener('click', () => {
    transmitter.play(CONFIG.FREQUENCY_0, '0');
  });

  document.getElementById('btn-play-1').addEventListener('click', () => {
    transmitter.play(CONFIG.FREQUENCY_1, '1');
  });

  document.getElementById('btn-stop-tx').addEventListener('click', () => {
    transmitter.stop();
  });

  // Receiver buttons
  document.getElementById('btn-start-mic').addEventListener('click', () => {
    receiver.start();
  });

  document.getElementById('btn-stop-mic').addEventListener('click', () => {
    receiver.stop();
  });

  document.getElementById('btn-calibrate').addEventListener('click', () => {
    receiver.calibrate();
  });

  // Mode switching tabs
  const tabTx = document.getElementById('tab-tx');
  const tabRx = document.getElementById('tab-rx');
  const tabBoth = document.getElementById('tab-both');
  const cardTx = document.getElementById('card-transmitter');
  const cardRx = document.getElementById('card-receiver');

  const setView = (mode) => {
    tabTx.classList.toggle('active', mode === 'tx');
    tabRx.classList.toggle('active', mode === 'rx');
    tabBoth.classList.toggle('active', mode === 'both');

    cardTx.style.display = mode === 'rx' ? 'none' : 'flex';
    cardRx.style.display = mode === 'tx' ? 'none' : 'flex';
  };

  tabTx.addEventListener('click', () => setView('tx'));
  tabRx.addEventListener('click', () => setView('rx'));
  tabBoth.addEventListener('click', () => setView('both'));
});
