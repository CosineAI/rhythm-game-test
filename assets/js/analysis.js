(() => {
  const {
    THRESH_WINDOW,
    THRESH_K,
    MIN_ONSET_INTERVAL_MS,
    NOTE_H,
    SPEED
  } = window.RG.Const;

  function assignLane(state, amp) {
    // Multi-band mapping in live mode using analyser spectrum; adapts to lane count
    const N = amp.length;
    const sampleRate = state.audioCtx ? state.audioCtx.sampleRate : 44100;
    const nyquist = sampleRate / 2;
    const activeLanes = window.RG.Difficulty.getActiveLaneIndices();
    const bandCount = activeLanes.length;
    const edges = window.RG.Freq.getBandEdges(sampleRate, 120, Math.min(4000, nyquist), bandCount);
    const energies = new Float32Array(bandCount);

    for (let i = 0; i < N; i++) {
      const f = (i / (N - 1)) * nyquist;
      const a = amp[i];
      if (f < edges[0] || f > edges[bandCount]) continue;
      let j = 0;
      while (j < bandCount && f > edges[j + 1]) j++;
      if (j < bandCount) {
        const e = a * a; // energy
        energies[j] += e;
      }
    }

    const weights = (bandCount === 3) ? [1.0, 1.05, 1.12]
                    : (bandCount === 5) ? [1.0, 1.0, 1.05, 1.12, 1.18]
                    : new Array(bandCount).fill(1.0);
    let best = -1, bestVal = -1, sum = 0;
    for (let b = 0; b < bandCount; b++) {
      sum += energies[b];
      const v = energies[b] * weights[b];
      if (v > bestVal) { bestVal = v; best = b; }
    }

    let lane;
    if (sum <= 1e-9) {
      // fallback rotate within active lanes
      const prevIdx = Math.max(0, activeLanes.indexOf(state.prevLane));
      lane = activeLanes[(prevIdx + 1) % bandCount];
    } else {
      lane = activeLanes[best];
    }
    if (lane === state.prevLane) {
      const idx = activeLanes.indexOf(lane);
      lane = activeLanes[(idx + 1) % bandCount];
    }
    state.prevLane = lane;
    return lane;
  }

  function scheduleNoteFromOnset(state, onsetTimeSec, lane) {
    const travelDist = Math.max(0, state.hitY - (NOTE_H / 2));
    const speedMult = (window.RG.Settings && window.RG.Settings.getFallSpeedMult) ? window.RG.Settings.getFallSpeedMult() : 1.0;
    const speed = SPEED * speedMult;
    const travelTimeMs = (travelDist / speed) * 1000;
    const userOffsetMs = (window.RG.Settings && window.RG.Settings.getInputOffsetMs()) || 0;
    const hitPerfMs = state.startAt + ((onsetTimeSec - state.audioBaseTime) * 1000) + window.RG.Const.ANALYSIS_DELAY_MS + userOffsetMs;
    const spawnRelMs = hitPerfMs - travelTimeMs - state.startAt;

    const def = { t: spawnRelMs, lane };
    state.schedule.push(def);
    state.schedule.sort((a, b) => a.t - b.t);
  }

  function analyzeStep(state) {
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
      const lane = assignLane(state, amp);
      scheduleNoteFromOnset(state, tSec, lane);
    }

    state.lastFlux = flux;
  }

  window.RG.Analysis = { analyzeStep, assignLane, scheduleNoteFromOnset };
})();