(() => {
  const ANALYSIS_DELAY_MS = 2000; // ms lookahead before scheduling visible notes
  const FFT_SIZE = 2048;          // analyser FFT size
  const ANALYSIS_HOP_MS = 20;     // how often we analyze (approx)
  const MIN_ONSET_INTERVAL_MS = 120; // refractory period for onsets
  const THRESH_WINDOW = 30;       // flux history window size (samples)
  const THRESH_K = 1.5;           // threshold multiplier

  // Offline precompute (chart) settings
  const CHART_FRAME_SIZE = 1024;
  const CHART_HOP_SIZE = 512;
  const CHART_THRESH_WINDOW = 40;   // frames
  const CHART_THRESH_K = 1.2;
  const CHART_MIN_SPACING_MS = 120;

  function getDifficulty() {
    const v = difficultySelect && difficultySelect.value || 'normal';
    return (v === 'easy' || v === 'hard') ? v : 'normal';
  }
  function getDifficultyParams() {
    const d = getDifficulty();
    if (d === 'easy') {
      return {
        name: 'Easy',
        threshK: 1.6,
        minSpacingMs: 260,
        smoothRadius: 4,
        threshWindow: 48
      };
    } else if (d === 'hard') {
      return {
        name: 'Hard',
        threshK: 1.0,
        minSpacingMs: 100,
        smoothRadius: 2,
        threshWindow: 36
      };
    }
    return {
      name: 'Normal',
      threshK: 1.2,
      minSpacingMs: 160,
      smoothRadius: 3,
      threshWindow: 40
    };
  }

  const KEY_ORDER = ['z','s','x','d','c'];
  const KEY_TO_LANE = { z: 0, s: 1, x: 2, d: 3, c: 4 };
  const LANE_TYPES = ['white', 'black', 'white', 'black', 'white'];

  const NOTE_H = 24;          // px
  const SPEED = 420;          // px/s
  const PERFECT_DIST = 12;    // px to hit-line
  const GOOD_DIST = 30;
  const OKAY_DIST = 56;
  const KEYCAPS_H = 120;      // must match CSS --keycaps-h

  const playfield = document.getElementById('playfield');
  const judgementEl = document.getElementById('judgement');
  const statusEl = document.getElementById('status');
  const lanes = Array.from(document.querySelectorAll('.lane'));
  const keycapNodes = new Map(KEY_ORDER.map(k => [k, document.querySelector(`.keycap[data-key="${k}"]`)]));
  const fileInput = document.getElementById('audioFile');
  const audioEl = document.getElementById('audioPlayer');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const playChartBtn = document.getElementById('playChartBtn');
  const difficultySelect = document.getElementById('difficultySelect');
  const comboEl = document.getElementById('combo');
  const comboValueEl = comboEl ? comboEl.querySelector('.value') : null;

  let state = resetState();

  function resetState() {
    return {
      running: false,
      ended: false,
      startAt: 0,
      lastTs: 0,
      hitY: 0,
      nextSpawnIdx: 0,
      schedule: [], // { t: msFromStart, lane }
      notes: [],    // { lane, el, spawnAt, y, judged }
      counts: { perfect: 0, good: 0, okay: 0, miss: 0 },
      combo: 0,
      maxCombo: 0,
      raf: 0,

      // Mode and audio graph
      mode: 'live',       // 'live' | 'f_codeilnewe</'
e'
      audioCtx: null,
      analyser: null,
      micStream: null,
      source: null,       // MediaStream source (mic)
      mediaNode: null,    // MediaElementAudioSourceNode (file)
      fileUrl: null,      // blob URL for uploaded file
      audioBaseTime: 0,   // AudioContext.currentTime when game starts (aligns with performance.now)
      analysisTimer: 0,
      prevAmp: null,
      fluxBuf: [],
      lastFlux: 0,
      lastOnsetTimeSec: -1e9,
      prevLane: -1,
      scratchFreq: null,

      // Precomputed chart state
      precomputedChart: null, // { fileName, durationMs, notes: [{ timeMs, lane }] }
      preferChartOnStart: false
    };
  }

  function measure() {
    const pfRect = playfield.getBoundingClientRect();
    state.hitY = pfRect.height - KEYCAPS_H - 12;
  }

  function clearNotes() {
    state.notes.forEach(n => n.el && n.el.remove());
    state.notes.length = 0;
  }

  async function setupLiveAudio() {
    // Ensure single persistent AudioContext
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    // Build analyser once
    if (!state.analyser) {
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = FFT_SIZE;
      state.analyser.smoothingTimeConstant = 0.0;
      state.analyser.minDecibels = -100;
      state.analyser.maxDecibels = -10;
      state.scratchFreq = new Float32Array(state.analyser.frequencyBinCount);
      state.prevAmp = new Float32Array(state.analyser.frequencyBinCount);
    }

    // Disconnect media node if previously connected
    if (state.mediaNode) {
      try { state.mediaNode.disconnect(); } catch {}
    }

    statusEl.textContent = 'Requesting microphone…';
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const source = state.audioCtx.createMediaStreamSource(stream);
    source.connect(state.analyser);

    state.source = source;
    state.micStream = stream;
  }

  async function setupFileAudio(file) {
    // Ensure single persistent AudioContext
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    // Build analyser once (even if not used during precomputed playback, harmless)
    if (!state.analyser) {
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = FFT_SIZE;
      state.analyser.smoothingTimeConstant = 0.0;
      state.analyser.minDecibels = -100;
      state.analyser.maxDecibels = -10;
      state.scratchFreq = new Float32Array(state.analyser.frequencyBinCount);
      state.prevAmp = new Float32Array(state.analyser.frequencyBinCount);
    }

    // Disconnect mic source if previously connected
    if (state.source) {
      try { state.source.disconnect(); } catch {}
      state.source = null;
    }

    // Wire up media element to analyser and destination
    if (!state.mediaNode) {
      state.mediaNode = state.audioCtx.createMediaElementSource(audioEl);
    } else {
      try { state.mediaNode.disconnect(); } catch {}
    }
    state.mediaNode.connect(state.analyser);
    state.mediaNode.connect(state.audioCtx.destination);

    // Load file into <audio>
    if (state.fileUrl) {
      try { URL.revokeObjectURL(state.fileUrl); } catch {}
      state.fileUrl = null;
    }
    const url = URL.createObjectURL(file);
    state.fileUrl = url;
    audioEl.src = url;
    audioEl.loop = false;
    audioEl.currentTime = 0;

    // Wait for metadata so duration and decoding are ready
    await new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onErr = (e) => { cleanup(); reject(e); };
      const cleanup = () => {
        audioEl.removeEventListener('loadedmetadata', onReady);
        audioEl.removeEventListener('error', onErr);
      };
      audioEl.addEventListener('loadedmetadata', onReady, { once: true });
      audioEl.addEventListener('error', onErr, { once: true });
      // In case metadata already loaded
      if (audioEl.readyState >= 1) {
        cleanup();
        resolve();
      }
    });
  }

  async function precomputeChartFromFile(file) {
    // Ensure an AudioContext for decoding
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    statusEl.textContent = 'Analyzing file (precomputing chart)…';

    const arrayBuf = await file.arrayBuffer();

    // Safari compatibility for decodeAudioData
    const decode = (audioCtx, ab) => new Promise((resolve, reject) => {
      // If promise-based is available
      const ret = audioCtx.decodeAudioData(ab, resolve, reject);
      if (ret && typeof ret.then === 'function') {
        ret.then(resolve).catch(reject);
      }
    });

    const audioBuf = await decode(state.audioCtx, arrayBuf);
    const sr = audioBuf.sampleRate;
    const durationMs = audioBuf.duration * 1000;

    // Mixdown to mono
    const ch0 = audioBuf.getChannelData(0);
    let mono;
    if (audioBuf.numberOfChannels > 1) {
      const ch1 = audioBuf.getChannelData(1);
      mono = new Float32Array(audioBuf.length);
      for (let i = 0; i < audioBuf.length; i++) {
        mono[i] = 0.5 * (ch0[i] + ch1[i]);
      }
    } else {
      mono = ch0;
    }

    // Compute RMS envelope
    const { timesMs, rms } = computeRmsEnvelope(mono, sr, CHART_FRAME_SIZE, CHART_HOP_SIZE);

    // Onset strength via positive difference
    const onset = new Float32Array(rms.length);
    onset[0] = 0;
    for (let i = 1; i < rms.length; i++) {
      const d = rms[i] - rms[i-1];
      onset[i] = d > 0 ? d : 0;
    }

    // Difficulty parameters
    const diff = getDifficultyParams();

    // Smooth with small moving average
    smoothInPlace(onset, diff.smoothRadius);

    // Peak picking with adaptive threshold
    const peaks = pickPeaks(onset, timesMs, diff.minSpacingMs, diff.threshK, diff.threshWindow);

    // Assign lanes using 5-band energy mapping near each peak (fallback to bounce)
    const notes = [];
    let prevLane = -1;
    let bounceLane = 0, dir = 1;
    for (let i = 0; i < peaks.length; i++) {
      const t = peaks[i];
      let lane = laneFromBandsAt(mono, sr, t);
      if (lane == null) {
        lane = bounceLane;
        bounceLane += dir;
        if (bounceLane >= 4) { bounceLane = 4; dir = -1; }
        if (bounceLane <= 0) { bounceLane = 0; dir = 1; }
      }
      if (lane === prevLane) {
        lane = (lane + 1) % 5;
      }
      notes.push({ timeMs: t, lane });
      prevLane = lane;
    }

    state.precomputedChart = {
      fileName: file.name,
      durationMs,
      difficulty: diff.name,
      notes
    };

    playChartBtn.disabled = notes.length === 0;
    statusEl.textContent = notes.length
      ? `Chart ready (${diff.name}, ${notes.length} notes). Press “Play chart” or Space to start.`
      : 'No strong onsets detected. Try another file or adjust thresholds.';
  }

  function computeRmsEnvelope(samples, sampleRate, frameSize, hopSize) {
    const frameCount = Math.floor((samples.length - frameSize) / hopSize) + 1;
    const rms = new Float32Array(Math.max(0, frameCount));
    const timesMs = new Float32Array(rms.length);

    let sumsq = 0;
    // First frame
    for (let i = 0; i < frameSize; i++) {
      const s = samples[i];
      sumsq += s * s;
    }
    rms[0] = Math.sqrt(sumsq / frameSize);
    timesMs[0] = (frameSize / 2) / sampleRate * 1000;

    let idx = 1;
    for (let start = hopSize; start + frameSize <= samples.length; start += hopSize) {
      // slide window: remove old, add new
      for (let i = 0; i < hopSize; i++) {
        const remove = samples[start - hopSize + i];
        const add = samples[start + frameSize - hopSize + i];
        sumsq += add * add - remove * remove;
      }
      rms[idx] = Math.sqrt(Math.max(0, sumsq) / frameSize);
      const center = start + frameSize / 2;
      timesMs[idx] = center / sampleRate * 1000;
      idx++;
    }
    return { timesMs, rms };
  }

  function smoothInPlace(arr, windowRadius) {
    if (!arr || arr.length === 0) return;
    const N = arr.length;
    const out = new Float32Array(N);
    const r = Math.max(0, windowRadius | 0);
    for (let i = 0; i < N; i++) {
      const left = Math.max(0, i - r);
      const right = Math.min(N - 1, i + r);
      let sum = 0;
      for (let j = left; j <= right; j++) sum += arr[j];
      out[i] = sum / (right - left + 1);
    }
    for (let i = 0; i < N; i++) arr[i] = out[i];
  }

  function pickPeaks(envelope, timesMs, minSpacingMs, k, window) {
    const peaks = [];
    const N = envelope.length;
    let lastPeakTime = -1e9;

    for (let i = 1; i < N - 1; i++) {
      const start = Math.max(0, i - window);
      const end = i;
      let mean = 0;
      let count = 0;
      for (let j = start; j < end; j++) { mean += envelope[j]; count++; }
      if (count === 0) continue;
      mean /= count;
      let varsum = 0;
      for (let j = start; j < end; j++) {
        const d = envelope[j] - mean;
        varsum += d*d;
      }
      const std = Math.sqrt(varsum / Math.max(1, count - 1));
      const threshold = mean + k * std;

      const isLocalMax = envelope[i] >= envelope[i-1] && envelope[i] > envelope[i+1];
      if (isLocalMax && envelope[i] > threshold) {
        const t = timesMs[i];
        if (t - lastPeakTime >= minSpacingMs) {
          peaks.push(t);
          lastPeakTime = t;
        }
      }
    }

    return peaks;
  }

  // --- Frequency-based lane mapping for precomputed peaks ---

  const _cache = { hann: {}, kIndex: {}, edges: {} };

  function getHann(N) {
    let w = _cache.hann[N];
    if (w) return w;
    w = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    }
    _cache.hann[N] = w;
    return w;
  }

  function getKIndex(N, bins) {
    const key = N + ':' + bins;
    let arr = _cache.kIndex[key];
    if (arr) return arr;
    arr = new Int32Array(bins);
    for (let b = 0; b < bins; b++) {
      let k = Math.floor(((b + 0.5) * (N / 2)) / bins);
      if (k < 1) k = 1; // avoid DC
      arr[b] = k;
    }
    _cache.kIndex[key] = arr;
    return arr;
  }

  function goertzelPower(frame, k, N) {
    const w = (2 * Math.PI * k) / N;
    const coeff = 2 * Math.cos(w);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      s0 = frame[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return s1 * s1 + s2 * s2 - coeff * s1 * s2;
  }

  function laneFromCentroidAt(samples, sampleRate, timeMs) {
    const N = 1024;
    const half = N >> 1;
    let center = Math.floor((timeMs / 1000) * sampleRate);
    let start = center - half;
    if (start < 0) start = 0;
    if (start + N > samples.length) start = samples.length - N;
    if (start < 0) return null;

    const win = getHann(N);
    const frame = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      frame[i] = samples[start + i] * win[i];
    }

    const BINS = 64;
    const kIndex = getKIndex(N, BINS);
    const nyquist = sampleRate / 2;
    const minHz = 120;
    const maxHz = Math.min(6000, nyquist);

    let num = 0, den = 0;
    for (let b = 0; b < BINS; b++) {
      const k = kIndex[b];
      const freq = (k * sampleRate) / N;
      if (freq < minHz || freq > maxHz) continue;
      const p = goertzelPower(frame, k, N);
      if (p <= 0) continue;
      num += freq * p;
      den += p;
    }

    if (den <= 1e-12) return null;

    const centroid = num / den;
    const norm = Math.max(0, Math.min(1, (centroid - minHz) / (maxHz - minHz)));
    let lane = Math.floor(norm * 5);
    if (lane < 0) lane = 0;
    if (lane > 4) lane = 4;
    return lane;
  }

  // Mel scale helpers and 5-band edges
  function mel(f) { return 1127 * Math.log(1 + f / 700); }
  function invMel(m) { return 700 * (Math.exp(m / 1127) - 1); }

  function getBandEdges(sampleRate, minHz, maxHz) {
    const key = sampleRate + ':' + minHz + ':' + maxHz;
    let edges = _cache.edges[key];
    if (edges) return edges;
    const nyquist = sampleRate / 2;
    const lo = Math.max(60, Math.min(minHz, nyquist));
    const hi = Math.max(lo + 10, Math.min(maxHz, nyquist));
    const melLo = mel(lo), melHi = mel(hi);
    edges = new Float32Array(6);
    for (let i = 0; i <= 5; i++) {
      const m = melLo + (melHi - melLo) * (i / 5);
      edges[i] = invMel(m);
    }
    _cache.edges[key] = edges;
    return edges;
  }

  // 5-band energy mapping around a given time to decide lane
  function laneFromBandsAt(samples, sampleRate, timeMs) {
    const N = 1024;
    const half = N >> 1;
    let center = Math.floor((timeMs / 1000) * sampleRate);
    let start = center - half;
    if (start < 0) start = 0;
    if (start + N > samples.length) start = samples.length - N;
    if (start < 0) return null;

    const win = getHann(N);
    const frame = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      frame[i] = samples[start + i] * win[i];
    }

    const BINS = 96;
    const kIndex = getKIndex(N, BINS);
    const nyquist = sampleRate / 2;
    const minHz = 120;
    const maxHz = Math.min(4000, nyquist);
    const edges = getBandEdges(sampleRate, minHz, maxHz);
    const energies = new Float32Array(5);

    for (let b = 0; b < BINS; b++) {
      const k = kIndex[b];
      const freq = (k * sampleRate) / N;
      if (freq < edges[0] || freq > edges[5]) continue;
      const p = goertzelPower(frame, k, N);
      if (p <= 0) continue;
      let j = 0;
      while (j < 5 && freq > edges[j + 1]) j++;
      if (j < 5) energies[j] += p;
    }

    // Slight bias to upper bands so the top lane (C) appears when appropriate
    const weights = [1.0, 1.0, 1.05, 1.12, 1.18];
    let best = -1, bestVal = -1, sum = 0;
    for (let i = 0; i < 5; i++) {
      sum += energies[i];
      const v = energies[i] * weights[i];
      if (v > bestVal) { bestVal = v; best = i; }
    }
    if (sum <= 1e-9) return null;
    return best;
  }

  async function startGame() {
    if (state.running) return;

    // Preserve any precomputed chart across reset
    const prevChart = state.precomputedChart;

    clearNotes();
    state = Object.assign(resetState(), {});
    state.precomputedChart = prevChart;
    measure();

    const file = fileInput && fileInput.files && fileInput.files[0];
    const hasChart = !!(file && state.precomputedChart && state.precomputedChart.fileName === file.name);

    if (hasChart && (state.preferChartOnStart || true)) {
      state.preferChartOnStart = false;
      await startChartPlayback(file);
      return;
    }

    if (file) {
      state.mode = 'file';
      try {
        await setupFileAudio(file);
      } catch (err) {
        console.error('Audio file error:', err);
        statusEl.textContent = 'Could not load audio file.';
        return;
      }
      try {
        await state.audioCtx.resume();
        await audioEl.play();
      } catch (err) {
        console.error('Playback error:', err);
        statusEl.textContent = 'Playback blocked. Click the page and press Space again.';
        return;
      }

      state.startAt = performance.now();
      state.audioBaseTime = state.audioCtx.currentTime;
      state.running = true;
      state.ended = false;
      statusEl.textContent = `File mode (live analysis): ${file.name} (delay ${ANALYSIS_DELAY_MS} ms)`;

      const onEnded = () => endGame();
      audioEl.addEventListener('ended', onEnded, { once: true });

      state.analysisTimer = setInterval(analyzeStep, ANALYSIS_HOP_MS);
      state.raf = requestAnimationFrame(tick);
    } else {
      state.mode = 'live';
      try {
        await setupLiveAudio();
      } catch (err) {
        console.error('Microphone error:', err);
        statusEl.textContent = 'Mic blocked/unavailable. Live mode requires microphone access.';
        return;
      }

      state.startAt = performance.now();
      state.audioBaseTime = state.audioCtx.currentTime;

      state.running = true;
      state.ended = false;
      statusEl.textContent = `Live mode: listening (delay ${ANALYSIS_DELAY_MS} ms)… clap, snap, or play music nearby`;

      state.analysisTimer = setInterval(analyzeStep, ANALYSIS_HOP_MS);
      state.raf = requestAnimationFrame(tick);
    }
  }

  async function startChartPlayback(file) {
    state.mode = 'chart';

    try {
      await setupFileAudio(file);
    } catch (err) {
      console.error('Audio file error:', err);
      statusEl.textContent = 'Could not load audio file.';
      return;
    }

    // Build schedule from precomputed chart
    const chart = state.precomputedChart;
    if (!chart || !chart.notes || !chart.notes.length) {
      statusEl.textContent = 'No chart available. Analyze first.';
      return;
    }

    const travelDist = Math.max(0, state.hitY - (NOTE_H / 2));
    const travelTimeMs = (travelDist / SPEED) * 1000;

    state.schedule = chart.notes.map(n => ({
      t: Math.max(0, n.timeMs - travelTimeMs),
      lane: n.lane
    }));
    state.schedule.sort((a, b) => a.t - b.t);
    state.nextSpawnIdx = 0;

    try {
      await state.audioCtx.resume();
      await audioEl.play();
    } catch (err) {
      console.error('Playback error:', err);
      statusEl.textContent = 'Playback blocked. Click the page and press Space again.';
      return;
    }

    state.startAt = performance.now();
    state.audioBaseTime = state.audioCtx.currentTime;

    state.running = true;
    state.ended = false;
    statusEl.textContent = `Chart mode: playing ${file.name} — ${chart.difficulty || 'Normal'} (${chart.notes.length} notes)`;

    const onEnded = () => endGame();
    audioEl.addEventListener('ended', onEnded, { once: true });

    state.raf = requestAnimationFrame(tick);
  }

  function endGame() {
    state.running = false;
    state.ended = true;
    cancelAnimationFrame(state.raf);
    clearInterval(state.analysisTimer);
    comboMiss();

    if (state.mode === 'file' || state.mode === 'chart') {
      try { audioEl.pause(); } catch {}
      try { audioEl.currentTime = 0; } catch {}
      if (state.fileUrl) {
        try { URL.revokeObjectURL(state.fileUrl); } catch {}
        state.fileUrl = null;
      }
      if (state.mediaNode) {
        try { state.mediaNode.disconnect(); } catch {}
      }
      statusEl.textContent = 'Stopped — press Space to start (file/chart mode or mic if no file)';
    } else {
      if (state.micStream) {
        state.micStream.getTracks().forEach(t => t.stop());
      }
      statusEl.textContent = 'Stopped — press Space to start live mode again';
    }

    if (state.audioCtx) {
      state.audioCtx.suspend().catch(()=>{});
    }
  }

  function analyzeStep() {
    if (!state.running || !state.analyser) return;

    const N = state.analyser.frequencyBinCount;
    const freqDb = state.scratchFreq;
    state.analyser.getFloatFrequencyData(freqDb);

    // Convert dB to linear amplitude
    const amp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const db = Math.max(-120, freqDb[i]);
      amp[i] = Math.pow(10, db / 20);
    }

    // Spectral flux
    let flux = 0;
    if (state.prevAmp) {
      for (let i = 0; i < N; i++) {
        const d = amp[i] - state.prevAmp[i];
        if (d > 0) flux += d;
      }
    }
    state.prevAmp = amp;

    const tSec = state.audioCtx.currentTime;
    state.fluxBuf.push(flux);
    if (state.fluxBuf.length > THRESH_WINDOW) state.fluxBuf.shift();

    const mean = state.fluxBuf.reduce((a,b)=>a+b,0) / state.fluxBuf.length;
    let variance = 0;
    for (let i = 0; i < state.fluxBuf.length; i++) {
      const d = state.fluxBuf[i] - mean;
      variance += d*d;
    }
    const std = Math.sqrt(variance / Math.max(1, state.fluxBuf.length - 1));
    const threshold = mean + THRESH_K * std;

    // Peak pick: rising over threshold with a small refractory period
    const isPeak = flux > threshold &&
                   flux > state.lastFlux &&
                   (tSec - state.lastOnsetTimeSec) * 1000 >= MIN_ONSET_INTERVAL_MS;

    if (isPeak) {
      state.lastOnsetTimeSec = tSec;
      const lane = assignLane(amp);
      scheduleNoteFromOnset(tSec, lane);
    }

    state.lastFlux = flux;
  }

  function assignLane(amp) {
    // 5-band mapping in live mode using analyser spectrum
    const N = amp.length;
    const sampleRate = state.audioCtx ? state.audioCtx.sampleRate : 44100;
    const nyquist = sampleRate / 2;
    const edges = getBandEdges(sampleRate, 120, Math.min(4000, nyquist));
    const energies = new Float32Array(5);

    for (let i = 0; i < N; i++) {
      const f = (i / (N - 1)) * nyquist;
      const a = amp[i];
      if (f < edges[0] || f > edges[5]) continue;
      let j = 0;
      while (j < 5 && f > edges[j + 1]) j++;
      if (j < 5) {
        const e = a * a; // energy
        energies[j] += e;
      }
    }

    const weights = [1.0, 1.0, 1.05, 1.12, 1.18];
    let best = -1, bestVal = -1, sum = 0;
    for (let b = 0; b < 5; b++) {
      sum += energies[b];
      const v = energies[b] * weights[b];
      if (v > bestVal) { bestVal = v; best = b; }
    }
    let lane;
    if (sum <= 1e-9) {
      lane = (state.prevLane + 1) % 5; // fallback rotate
    } else {
      lane = best;
    }
    if (lane === state.prevLane) lane = (lane + 1) % 5;
    state.prevLane = lane;
    return lane;
  }

  function scheduleNoteFromOnset(onsetTimeSec, lane) {
    const travelDist = Math.max(0, state.hitY - (NOTE_H / 2));
    const travelTimeMs = (travelDist / SPEED) * 1000;
    const hitPerfMs = state.startAt + ((onsetTimeSec - state.audioBaseTime) * 1000) + ANALYSIS_DELAY_MS;
    const spawnRelMs = hitPerfMs - travelTimeMs - state.startAt;

    const def = { t: spawnRelMs, lane };
    state.schedule.push(def);
    state.schedule.sort((a, b) => a.t - b.t);
  }

  function spawnNote(def) {
    const laneEl = lanes[def.lane];
    const el = document.createElement('div');
    el.className = `note ${LANE_TYPES[def.lane]}`;
    el.style.top = '0px';
    laneEl.appendChild(el);
    state.notes.push({
      lane: def.lane,
      el,
      spawnAt: state.startAt + def.t,
      y: 0,
      judged: false
    });
  }

  function updateNotes(ts) {
    const elapsed = ts - state.startAt;

    // Spawn due notes
    while (state.nextSpawnIdx < state.schedule.length && elapsed >= state.schedule[state.nextSpawnIdx].t) {
      spawnNote(state.schedule[state.nextSpawnIdx++]);
    }

    for (const n of state.notes) {
      if (!n.el) continue;
      const sinceSpawn = (ts - n.spawnAt) / 1000;
      if (sinceSpawn < 0) continue;
      n.y = sinceSpawn * SPEED;
      n.el.style.transform = `translateY(${n.y}px)`;

      const center = n.y + (NOTE_H / 2);
      if (!n.judged && center > state.hitY + OKAY_DIST) {
        n.judged = true;
        flash('Miss', 'miss');
        state.counts.miss++;
        comboMiss();
        n.el.classList.add('miss');
        setTimeout(() => n.el && n.el.remove(), 260);
      }
    }
  }

  function pickCandidate(lane) {
    let best = null;
    let bestDist = Infinity;
    for (const n of state.notes) {
      if (n.lane !== lane || n.judged || !n.el) continue;
      const center = n.y + (NOTE_H / 2);
      const dist = Math.abs(center - state.hitY);
      if (dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }
    return { note: best, dist: bestDist };
  }

  function judge(dist) {
    if (dist <= PERFECT_DIST) return 'perfect';
    if (dist <= GOOD_DIST) return 'good';
    if (dist <= OKAY_DIST) return 'okay';
    return null;
  }

  function flash(text, cls) {
    judgementEl.textContent = text;
    judgementEl.className = `judgement show ${cls}`;
    clearTimeout(judgementEl._t);
    judgementEl._t = setTimeout(() => {
      judgementEl.className = 'judgement';
    }, 420);
  }

  function triggerGlow(lane) {
    const laneEl = lanes[lane];
    if (!laneEl) return;
    const glow = document.createElement('div');
    glow.className = 'glow';
    laneEl.appendChild(glow);
    glow.addEventListener('animationend', () => glow.remove(), { once: true });
  }

  function screenShake() {
    playfield.classList.remove('shake');
    void playfield.offsetWidth;
    playfield.classList.add('shake');
    playfield.addEventListener('animationend', () => {
      playfield.classList.remove('shake');
    }, { once: true });
  }

  // Combo system
  function comboBurst() {
    if (!playfield) return;
    const b = document.createElement('div');
    b.className = 'burst';
    playfield.appendChild(b);
    b.addEventListener('animationend', () => b.remove(), { once: true });
  }

  function updateComboUI({ pop = false, bump = false } = {}) {
    if (!comboEl || !comboValueEl) return;
    comboValueEl.textContent = String(state.combo);
    if (pop && !comboEl.classList.contains('show')) {
      comboEl.classList.add('show');
    } else if (bump && comboEl.classList.contains('show')) {
      comboEl.classList.remove('bump');
      // restart bump animation
      void comboEl.offsetWidth;
      comboEl.classList.add('bump');
    }
  }

  function comboHit() {
    state.combo = (state.combo || 0) + 1;
    state.maxCombo = Math.max(state.maxCombo || 0, state.combo);

    if (state.combo === 10) {
      updateComboUI({ pop: true });
      comboBurst();
    } else if (state.combo > 10) {
      updateComboUI({ bump: true });
      if (state.combo % 10 === 0) comboBurst();
    }
  }

  function comboMiss() {
    if (state.combo >= 10 && comboEl) {
      comboEl.classList.remove('show');
      comboEl.classList.remove('bump');
    }
    state.combo = 0;
  }

  function hitLane(lane) {
    if (!state.running) return;
    const { note, dist } = pickCandidate(lane);
    const j = note ? judge(dist) : null;

    if (note) {
      if (j) {
        note.judged = true;
        note.el.classList.add('hit');
        setTimeout(() => note.el && note.el.remove(), 180);
        state.counts[j]++;
        flash(capitalize(j), j);
        triggerGlow(lane);
        screenShake();
        comboHit();
      } else {
        // There is a note in this column, but timing was outside windows -> Miss
        flash('Miss', 'miss');
        state.counts.miss++;
        comboMiss();
      }
    } else {
      // No notes in this column -> no penalty and no Miss flash
    }
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function tick(ts) {
    if (!state.running) return;
    updateNotes(ts);
    state.lastTs = ts;
    state.raf = requestAnimationFrame(tick);
  }

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!state.running) startGame();
      else endGame();
      return;
    }
    if (KEY_TO_LANE[key] !== undefined) {
      if (!e.repeat) {
        const cap = keycapNodes.get(key);
        if (cap) cap.classList.add('active');
        hitLane(KEY_TO_LANE[key]);
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (KEY_TO_LANE[key] !== undefined) {
      const cap = keycapNodes.get(key);
      if (cap) cap.classList.remove('active');
    }
  });

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      // Reset any previous chart when selecting a new file
      if (state.precomputedChart) {
        state.precomputedChart = null;
      }
      if (analyzeBtn) analyzeBtn.disabled = !f;
      if (playChartBtn) playChartBtn.disabled = true;

      if (f) {
        const diff = getDifficultyParams().name;
        statusEl.textContent = `Selected: ${f.name} — Difficulty: ${diff}. Click “Analyze” to precompute a chart, or press Space for live analysis.`;
      } else {
        statusEl.textContent = 'No file selected — Space will start microphone live mode.';
      }
    });
  }

  if (difficultySelect) {
    difficultySelect.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) {
        const diff = getDifficultyParams().name;
        // Invalidate existing chart if difficulty changed
        if (state.precomputedChart && state.precomputedChart.fileName === f.name && state.precomputedChart.difficulty !== diff) {
          state.precomputedChart = null;
          if (playChartBtn) playChartBtn.disabled = true;
        }
        if (analyzeBtn) analyzeBtn.disabled = !f;
        statusEl.textContent = `Selected: ${f.name} — Difficulty: ${diff}. Click “Analyze” to precompute a chart, or press Space for live analysis.`;
      }
    });
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) {
        statusEl.textContent = 'Choose a file first.';
        return;
      }
      analyzeBtn.disabled = true;
      try {
        await precomputeChartFromFile(f);
        playChartBtn.disabled = !(state.precomputedChart && state.precomputedChart.notes.length);
      } catch (e) {
        console.error(e);
        statusEl.textContent = 'Analysis failed.';
      } finally {
        analyzeBtn.disabled = false;
      }
    });
  }

  if (playChartBtn) {
    playChartBtn.addEventListener('click', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f || !state.precomputedChart) {
        statusEl.textContent = 'Analyze a file first.';
        return;
      }
      if (state.running) {
        endGame();
        return;
      }
      state.preferChartOnStart = true;
      await startGame();
    });
  }

  window.addEventListener('resize', measure);
})();