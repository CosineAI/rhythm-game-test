(() => {
  const { computeRmsEnvelope, laneFromBandsAt } = window.RG.Algo;
  const { CHART_FRAME_SIZE, CHART_HOP_SIZE } = window.RG.Const;
  const { getDifficultyParams, getActiveLaneIndices } = window.RG.Difficulty;
  const { getBandEdges, getHann, getKIndex, goertzelPower } = window.RG.Freq;

  // Simple tempo estimation from onset peaks (IOI histogram)
  function estimateTempoFromPeaks(peaksMs) {
    if (!peaksMs || peaksMs.length < 6) return null;
    const intervals = [];
    for (let i = 1; i < peaksMs.length; i++) {
      const d = peaksMs[i] - peaksMs[i-1];
      if (d >= 250 && d <= 1500) intervals.push(d); // 40–240 BPM
    }
    if (intervals.length < 4) return null;
    const bucketSize = 10;
    const counts = new Map();
    for (const d of intervals) {
      const b = Math.round(d / bucketSize) * bucketSize;
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    let bestB = 0, bestC = -1;
    counts.forEach((c, b) => { if (c > bestC) { bestC = c; bestB = b; } });
    if (bestC <= 0) return null;
    let period = bestB;
    let bpm = 60000 / period;
    while (bpm < 60) { bpm *= 2; period /= 2; }
    while (bpm > 180) { bpm /= 2; period *= 2; }
    return { bpm, periodMs: period };
  }

  // Build onsets via RMS envelope positive differences and pick peaks
  function buildPeaks(mono, sr, diff) {
    const { timesMs, rms } = computeRmsEnvelope(mono, sr, CHART_FRAME_SIZE, CHART_HOP_SIZE);
    const onset = new Float32Array(rms.length);
    onset[0] = 0;
    for (let i = 1; i < rms.length; i++) {
      const d = rms[i] - rms[i-1];
      onset[i] = d > 0 ? d : 0;
    }
    if (window.RG.Algo && window.RG.Algo.smoothInPlace) {
      window.RG.Algo.smoothInPlace(onset, diff.smoothRadius);
    }
    const peaks = window.RG.Algo.pickPeaks(onset, timesMs, diff.minSpacingMs, diff.threshK, diff.threshWindow);
    return { peaks, timesMs, rms };
  }

  // Compute band energies at a time (for chord lane selection)
  function bandEnergiesAt(samples, sampleRate, timeMs, bandCount) {
    const N = 1024;
    const half = N >> 1;
    let center = Math.floor((timeMs / 1000) * sampleRate);
    let start = center - half;
    if (start < 0) start = 0;
    if (start + N > samples.length) start = samples.length - N;
    if (start < 0) return null;

    const win = getHann(N);
    const frame = new Float32Array(N);
    for (let i = 0; i < N; i++) frame[i] = samples[start + i] * win[i];

    const BINS = 96;
    const kIndex = getKIndex(N, BINS);
    const nyquist = sampleRate / 2;
    const minHz = 120;
    const maxHz = Math.min(4000, nyquist);
    const edges = getBandEdges(sampleRate, minHz, maxHz, bandCount);
    const energies = new Float32Array(bandCount);

    for (let b = 0; b < BINS; b++) {
      const k = kIndex[b];
      const freq = (k * sampleRate) / N;
      if (freq < edges[0] || freq > edges[bandCount]) continue;
      const p = goertzelPower(frame, k, N);
      if (p <= 0) continue;
      let j = 0;
      while (j < bandCount && freq > edges[j + 1]) j++;
      if (j < bandCount) energies[j] += p;
    }
    return energies;
  }

  // Find nearest index in a monotonically increasing time array
  function indexForTime(timesMs, t) {
    let lo = 0, hi = timesMs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = timesMs[mid];
      if (v < t) lo = mid + 1;
      else hi = mid - 1;
    }
    const idx = Math.max(0, Math.min(timesMs.length - 1, lo));
    // choose closer between idx and idx-1
    if (idx > 0 && Math.abs(timesMs[idx - 1] - t) < Math.abs(timesMs[idx] - t)) return idx - 1;
    return idx;
  }

  async function precomputeBeatChordChartFromFileV15(state, file) {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }
    const statusEl = window.RG.Dom.statusEl;
    if (statusEl) statusEl.textContent = 'Analyzing file (Beat+Chord v1.5)…';

    const arrayBuf = await file.arrayBuffer();
    const decode = (audioCtx, ab) => new Promise((resolve, reject) => {
      const ret = audioCtx.decodeAudioData(ab, resolve, reject);
      if (ret && typeof ret.then === 'function') ret.then(resolve).catch(reject);
    });
    const audioBuf = await decode(state.audioCtx, arrayBuf);
    const sr = audioBuf.sampleRate;
    const durationMs = audioBuf.duration * 1000;

    // Mix to mono
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

    // Build peaks and estimate tempo
    const diff = getDifficultyParams();
    const { peaks, timesMs, rms } = buildPeaks(mono, sr, diff);
    const tempo = estimateTempoFromPeaks(peaks);

    // Default BPM fallback if tempo failed (ensure solid density)
    function defaultBpmFor(diffName) {
      if (diffName === 'Hard') return 120;
      if (diffName === 'Normal') return 115;
      if (diffName === 'Easy') return 105;
      return 95; // Very Easy
    }
    const periodMs = tempo && tempo.periodMs ? tempo.periodMs : (60000 / defaultBpmFor(diff.name));

    // Build beat times across duration, anchored near PAD start
    const PAD_MS = (window.RG.Settings && window.RG.Settings.getChartPadMs) ? window.RG.Settings.getChartPadMs() : 3000;
    let t0 = PAD_MS;
    if (peaks && peaks.length) {
      // align t0 to nearest beat after PAD
      const firstPeak = peaks[0];
      const offset = ((PAD_MS - firstPeak) % periodMs + periodMs) % periodMs;
      t0 = PAD_MS + ((periodMs - offset) % periodMs);
    }
    const beats = [];
    for (let t = t0; t <= (durationMs - PAD_MS); t += periodMs) beats.push(t);

    // Compute global stats for energy gating chords
    const meanRms = rms.reduce((a,b)=>a+b,0) / Math.max(1, rms.length);
    let varsum = 0;
    for (let i = 0; i < rms.length; i++) { const d = rms[i] - meanRms; varsum += d*d; }
    const stdRms = Math.sqrt(varsum / Math.max(1, rms.length - 1));
    const strongThreshold = meanRms + 0.4 * stdRms;

    // Difficulty-based parameters
    const lanes = getActiveLaneIndices();
    // Base chance that any given beat becomes a two-key chord
    const baseChordProb = (diff.name === 'Hard') ? 0.42
                          : (diff.name === 'Normal') ? 0.30
                          : (diff.name === 'Easy') ? 0.18
                          : 0.10; // Very Easy
    // Extra chance for a chord on strong (downbeat) positions
    const strongChordProb = (diff.name === 'Hard') ? 1.00   // always chord on strong beats
                           : (diff.name === 'Normal') ? 0.70
                           : (diff.name === 'Easy') ? 0.35
                           : 0.20;
    // Additional offbeat density for Hard/Normal
    const addOffbeatRatio = (diff.name === 'Hard') ? 0.35
                           : (diff.name === 'Normal') ? 0.22
                           : 0.10;

    const notes = [];
    let prevLane = -1;
    const rng = (seed => () => { // simple LCG for deterministic sampling across sessions
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed & 0xffff) / 0xffff;
    })(1234567);

    // Place notes on beats
    for (let i = 0; i < beats.length; i++) {
      const t = beats[i];

      // Lane selection by band energies around beat
      let lane = laneFromBandsAt(mono, sr, t, lanes);
      if (lane == null) {
        // fallback rotate within lanes
        const idx = Math.max(0, lanes.indexOf(prevLane));
        lane = lanes[(idx + 1) % lanes.length];
      }
      if (lane === prevLane) {
        const idx = lanes.indexOf(lane);
        lane = lanes[(idx + 1) % lanes.length];
      }

      // Chord decision: probability boosted on strong beats (+ energy boost)
      const beatIdx = indexForTime(timesMs, t);
      const energy = rms[beatIdx] || 0;
      const boost = energy > strongThreshold ? 0.18 : 0.0;
      const isStrongBeat = (i % 4 === 0);
      const chordProb = Math.min(0.85, baseChordProb + boost);
      let doChord = rng() < chordProb;
      if (!doChord && isStrongBeat) {
        // force additional chance on strong beats; for Hard it's guaranteed
        doChord = rng() < strongChordProb;
      }

      if (doChord) {
        // Pick two distinct lanes: current lane + another far-apart one by energies
        const energies = bandEnergiesAt(mono, sr, t, lanes.length) || new Float32Array(lanes.length);
        // pick best two indices
        let first = -1, second = -1, v1 = -1, v2 = -1;
        for (let b = 0; b < energies.length; b++) {
          const v = energies[b];
          if (v > v1) { v2 = v1; second = first; v1 = v; first = b; }
          else if (v > v2) { v2 = v; second = b; }
        }
        let lane2 = lanes[second >= 0 ? second : ((lanes.indexOf(lane) + 2) % lanes.length)];
        // ensure distinct and spaced
        if (lane2 === lane) lane2 = lanes[(lanes.indexOf(lane) + 2) % lanes.length];

        // Occasionally add a 3rd tone on Hard strong beats for emphasis
        if (diff.name === 'Hard' && isStrongBeat && rng() < 0.25 && lanes.length >= 5) {
          // pick a third lane that is neither lane nor lane2
          let lane3 = lanes[(lanes.indexOf(lane2) + 2) % lanes.length];
          if (lane3 === lane || lane3 === lane2) {
            lane3 = lanes[(lanes.indexOf(lane) + 3) % lanes.length];
          }
          notes.push({ timeMs: t, lane });
          notes.push({ timeMs: t, lane: lane2 });
          notes.push({ timeMs: t, lane: lane3 });
        } else {
          notes.push({ timeMs: t, lane });
          notes.push({ timeMs: t, lane: lane2 });
        }
      } else {
        notes.push({ timeMs: t, lane });
      }
      prevLane = lane;

      // Optional offbeat note for added rhythmic density (Hard/Normal mostly)
      if (rng() < addOffbeatRatio) {
        const tOff = t + periodMs / 2;
        if (tOff <= (durationMs - PAD_MS)) {
          let laneOff = laneFromBandsAt(mono, sr, tOff, lanes);
          if (laneOff == null || laneOff === prevLane) {
            const idx = Math.max(0, lanes.indexOf(prevLane));
            laneOff = lanes[(idx + 1) % lanes.length];
          }
          notes.push({ timeMs: tOff, lane: laneOff });
          prevLane = laneOff;
        }
      }
    }

    // Beat grid for UI
    const beatGrid = [];
    // backtrack from t0 to near 0 for grid completeness
    let gridT0 = t0;
    while (gridT0 - periodMs >= 0) gridT0 -= periodMs;
    for (let t = gridT0; t <= durationMs; t += periodMs) beatGrid.push(t);

    state.precomputedChart = {
      fileName: file.name,
      durationMs,
      difficulty: diff.name,
      notes,
      bpm: tempo ? tempo.bpm : (60000 / periodMs),
      beats: beatGrid,
      method: 'beat_v15'
    };

    const playChartBtn = window.RG.Dom.playChartBtn;
    if (playChartBtn) playChartBtn.disabled = notes.length === 0;
    if (statusEl) {
      statusEl.textContent = notes.length
        ? `Chart ready (Beat+Chord v1.5, ${diff.name}, ${notes.length} notes). Click Start to play.`
        : 'Beat+Chord v1.5: generation produced no notes. Try another file.';
    }
  }

  window.RG.BeatChords = { precomputeBeatChordChartFromFileV15 };
})();