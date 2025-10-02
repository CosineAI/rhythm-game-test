(() => {
  const { statusEl, playChartBtn } = window.RG.Dom;
  const { CHART_FRAME_SIZE, CHART_HOP_SIZE } = window.RG.Const;
  const { getDifficultyParams, getActiveLaneIndices } = window.RG.Difficulty;
  const { computeRmsEnvelope, smoothInPlace, pickPeaks, laneFromBandsAt } = window.RG.Algo;

  async function precomputeChartFromFile(state, file) {
    // Ensure an AudioContext for decoding
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    if (statusEl) statusEl.textContent = 'Analyzing file (precomputing chart)…';

    const arrayBuf = await file.arrayBuffer();

    // Safari compatibility for decodeAudioData
    const decode = (audioCtx, ab) => new Promise((resolve, reject) => {
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

    // Estimate BPM from peak intervals (experimental)
    function estimateTempo(peaksMs) {
      if (!peaksMs || peaksMs.length < 6) return null;
      const intervals = [];
      for (let i = 1; i < peaksMs.length; i++) {
        const d = peaksMs[i] - peaksMs[i-1];
        if (d >= 250 && d <= 1500) intervals.push(d); // 40–240 BPM raw IOI
      }
      if (intervals.length < 4) return null;
      // Histogram
      const bucketSize = 10;
      const counts = new Map();
      for (const d of intervals) {
        const b = Math.round(d / bucketSize) * bucketSize;
        counts.set(b, (counts.get(b) || 0) + 1);
      }
      // Find mode
      let bestB = 0, bestC = -1;
      counts.forEach((c, b) => { if (c > bestC) { bestC = c; bestB = b; } });
      if (bestC <= 0) return null;
      let period = bestB;
      // Normalize to ~60–180 BPM
      let bpm = 60000 / period;
      while (bpm < 60) { bpm *= 2; period /= 2; }
      while (bpm > 180) { bpm /= 2; period *= 2; }
      return { bpm, periodMs: period };
    }
    const tempo = estimateTempo(peaks);

    // Exclude notes near start/end based on settings
    const PAD_MS = (window.RG.Settings && window.RG.Settings.getChartPadMs) ? window.RG.Settings.getChartPadMs() : 3000;
    const list = peaks.filter(t => t >= PAD_MS && t <= (durationMs - PAD_MS));

    // Assign lanes using multi-band energy mapping near each peak (fallback to bounce)
    const notes = [];
    let prevLane = -1;
    const activeLanes = getActiveLaneIndices();
    let bouncePtr = 0, dir = 1;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      let lane = laneFromBandsAt(mono, sr, t, activeLanes);
      if (lane == null) {
        lane = activeLanes[bouncePtr];
        bouncePtr += dir;
        if (bouncePtr >= activeLanes.length - 1) { bouncePtr = activeLanes.length - 1; dir = -1; }
        if (bouncePtr <= 0) { bouncePtr = 0; dir = 1; }
      }
      if (lane === prevLane) {
        const idx = activeLanes.indexOf(lane);
        lane = activeLanes[(idx + 1) % activeLanes.length];
      }
      notes.push({ timeMs: t, lane });
      prevLane = lane;
    }

    // Build beat grid using tempo (if available)
    let beats = [];
    if (tempo && tempo.periodMs > 0) {
      // Use first kept peak as anchor; extend across full duration
      const period = tempo.periodMs;
      const anchor = list.length ? list[0] : (peaks.length ? peaks[0] : 0);
      // Backtrack to near 0
      let t0 = anchor;
      while (t0 - period >= 0) t0 -= period;
      // Generate until end
      for (let t = t0; t <= durationMs; t += period) {
        beats.push(t);
      }
    }

    state.precomputedChart = {
      fileName: file.name,
      durationMs,
      difficulty: diff.name,
      notes,
      bpm: tempo ? tempo.bpm : null,
      beats
    };

    if (playChartBtn) playChartBtn.disabled = notes.length === 0;
    if (statusEl) {
      statusEl.textContent = notes.length
        ? `Chart ready (${diff.name}, ${notes.length} notes). Click Start to play.`
        : 'No strong onsets detected. Try another file or adjust thresholds.';
    }
  }

  window.RG.Chart = { precomputeChartFromFile };
})();