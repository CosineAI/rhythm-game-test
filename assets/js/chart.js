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

    statusEl.textContent = 'Analyzing file (precomputing chart)…';

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

    // Assign lanes using multi-band energy mapping near each peak (fallback to bounce)
    const notes = [];
    let prevLane = -1;
    const activeLanes = getActiveLaneIndices();
    let bouncePtr = 0, dir = 1;
    for (let i = 0; i < peaks.length; i++) {
      const t = peaks[i];
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

  window.RG.Chart = { precomputeChartFromFile };
})();