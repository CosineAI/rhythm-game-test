(() => {
  const { getHann, getKIndex, goertzelPower } = window.RG.Freq;
  const { CHART_FRAME_SIZE, CHART_HOP_SIZE } = window.RG.Const;
  const { getDifficultyParams, getActiveLaneIndices } = window.RG.Difficulty;

  // Compute 12-bin chroma from audio frame using coarse Goertzel sampling
  function chromaForFrame(frame, sampleRate) {
    const N = frame.length;
    const BINS = 96;
    const kIndex = getKIndex(N, BINS);
    const nyquist = sampleRate / 2;
    const minHz = 60;
    const maxHz = Math.min(4000, nyquist);

    const chroma = new Float32Array(12);
    for (let b = 0; b < BINS; b++) {
      const k = kIndex[b];
      const f = (k * sampleRate) / N;
      if (f < minHz || f > maxHz) continue;
      const p = goertzelPower(frame, k, N);
      if (p <= 0) continue;
      const pitchClass = Math.round(12 * Math.log2(f / 440) + 69) % 12; // map freq to pitch class (A4=440)
      const pc = (pitchClass + 12) % 12;
      chroma[pc] += p;
    }
    return chroma;
  }

  // Simple chord template scores for major/minor triads
  const CHORD_TEMPLATES = (() => {
    const majors = [];
    const minors = [];
    for (let root = 0; root < 12; root++) {
      const tplMaj = new Float32Array(12);
      const tplMin = new Float32Array(12);
      tplMaj[root] = 1;
      tplMaj[(root + 4) % 12] = 0.8; // major third
      tplMaj[(root + 7) % 12] = 0.9; // perfect fifth
      tplMin[root] = 1;
      tplMin[(root + 3) % 12] = 0.8; // minor third
      tplMin[(root + 7) % 12] = 0.9;
      majors.push(tplMaj);
      minors.push(tplMin);
    }
    return { majors, minors };
  })();

  function bestChordFromChroma(chroma, threshold) {
    let best = { type: 'none', root: -1, score: -1 };
    // normalize chroma
    const sum = chroma.reduce((a,b)=>a+b,0);
    const c = sum > 0 ? chroma.map(v => v / sum) : chroma;

    for (let root = 0; root < 12; root++) {
      const tplMaj = CHORD_TEMPLATES.majors[root];
      const tplMin = CHORD_TEMPLATES.minors[root];
      // dot products as scores
      let sMaj = 0, sMin = 0;
      for (let i = 0; i < 12; i++) {
        sMaj += c[i] * tplMaj[i];
        sMin += c[i] * tplMin[i];
      }
      if (sMaj > best.score) best = { type: 'major', root, score: sMaj };
      if (sMin > best.score) best = { type: 'minor', root, score: sMin };
    }
    const thr = (typeof threshold === 'number') ? threshold : 0.02;
    if (best.score < thr) return { type: 'none', root: -1, score: best.score };
    return best;
  }

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

  // Map triad degrees to 5 lanes with ergonomic alternation
  function lanePatternForChord(rootPc, type, activeLanes) {
    // Use a 4-step pattern: root -> third -> fifth -> third
    // Map to lane indices [left, center, right, center] within available lanes
    const left = activeLanes[0];
    const center = activeLanes[Math.floor(activeLanes.length / 2)];
    const right = activeLanes[activeLanes.length - 1];
    return [left, center, right, center];
  }

  async function precomputeChordChartFromFileV15(state, file) {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }
    const statusEl = window.RG.Dom.statusEl;
    if (statusEl) statusEl.textContent = 'Analyzing file (chord v1.5)…';

    const arrayBuf = await file.arrayBuffer();
    // Safari-compatible decode
    const decode = (audioCtx, ab) => new Promise((resolve, reject) => {
      const ret = audioCtx.decodeAudioData(ab, resolve, reject);
      if (ret && typeof ret.then === 'function') {
        ret.then(resolve).catch(reject);
      }
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

    // Frame and hop
    const frameSize = CHART_FRAME_SIZE;
    const hopSize = CHART_HOP_SIZE;
    const hann = getHann(frameSize);
    const frameCount = Math.floor((mono.length - frameSize) / hopSize) + 1;

    const timesMs = new Float32Array(Math.max(0, frameCount));
    const chromaSeq = new Array(frameCount);
    const rms = new Float32Array(frameCount);

    // Prepare RMS and chroma per frame
    for (let i = 0; i < frameCount; i++) {
      const start = i * hopSize;
      let sumsq = 0;
      const frame = new Float32Array(frameSize);
      for (let j = 0; j < frameSize; j++) {
        const s = mono[start + j] || 0;
        sumsq += s * s;
        frame[j] = s * hann[j];
      }
      rms[i] = Math.sqrt(sumsq / frameSize);
      timesMs[i] = ((start + frameSize / 2) / sr) * 1000;
      chromaSeq[i] = chromaForFrame(frame, sr);
    }

    // Onset strength from RMS
    const onset = new Float32Array(rms.length);
    onset[0] = 0;
    for (let i = 1; i < rms.length; i++) {
      const d = rms[i] - rms[i-1];
      onset[i] = d > 0 ? d : 0;
    }

    const diff = getDifficultyParams();

    // Smooth onset slightly using Algo.smoothInPlace if available
    if (window.RG.Algo && window.RG.Algo.smoothInPlace) {
      window.RG.Algo.smoothInPlace(onset, diff.smoothRadius);
    }

    // Peak picking using Algo.pickPeaks
    const peaks = (window.RG.Algo && window.RG.Algo.pickPeaks)
      ? window.RG.Algo.pickPeaks(onset, timesMs, diff.minSpacingMs, diff.threshK, diff.threshWindow)
      : [];

    const tempo = estimateTempoFromPeaks(peaks);
    const PAD_MS = (window.RG.Settings && window.RG.Settings.getChartPadMs) ? window.RG.Settings.getChartPadMs() : 3000;

    // Difficulty-based chord confidence threshold (lower = more sensitive)
    function getChordConfThreshold(d) {
      const n = (d && d.name) || 'Normal';
      if (n === 'Hard') return 0.020;
      if (n === 'Normal') return 0.015;
      if (n === 'Easy') return 0.012;
      return 0.010; // Very Easy
    }
    const chordThresh = getChordConfThreshold(diff);

    // Chord detection: slide over frames and pick best triad
    const chordLabels = new Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      chordLabels[i] = bestChordFromChroma(chromaSeq[i], chordThresh);
    }

    // Fill short gaps by carrying forward last valid chord up to 2s
    const filledLabels = chordLabels.slice();
    let lastValid = null;
    let lastValidTime = null;
    for (let i = 0; i < frameCount; i++) {
      const label = filledLabels[i];
      const t = timesMs[i];
      if (label.type !== 'none' && label.root >= 0) {
        lastValid = label;
        lastValidTime = t;
      } else if (lastValid && lastValidTime != null && (t - lastValidTime) <= 2000) {
        filledLabels[i] = lastValid;
      }
    }

    // Segment chords: consecutive frames with same root/type
    const segments = [];
    let cur = null;
    for (let i = 0; i < frameCount; i++) {
      const label = filledLabels[i];
      const t = timesMs[i];
      if (!cur || label.type !== cur.type || label.root !== cur.root) {
        if (cur) cur.endMs = t;
        cur = { type: label.type, root: label.root, startMs: t, endMs: t };
        segments.push(cur);
      } else {
        cur.endMs = t;
      }
    }
    if (cur && segments.length) {
      // extend last to end of audio if close
      segments[segments.length - 1].endMs = durationMs;
    }

    // Generate notes: arpeggio within each chord segment, aligned to beat if available
    const activeLanes = getActiveLaneIndices();
    const notes = [];
    const periodMs = tempo && tempo.periodMs ? tempo.periodMs : 300; // default spacing
    for (const seg of segments) {
      if (seg.type === 'none' || seg.root < 0) continue;
      const start = Math.max(PAD_MS, seg.startMs);
      const end = Math.min(durationMs - PAD_MS, seg.endMs);
      if (end - start < 200) continue;

      const pattern = lanePatternForChord(seg.root, seg.type, activeLanes);
      let t0 = start;
      // align to nearest beat if beats exist
      if (tempo && tempo.periodMs > 0 && peaks.length) {
        // use first peak <= start
        let anchor = peaks[0];
        for (let i = 1; i < peaks.length; i++) {
          if (peaks[i] <= start) anchor = peaks[i];
          else break;
        }
        // shift t0 forward to align to beat grid
        const offset = (start - anchor) % periodMs;
        t0 = start + (periodMs - offset);
      }

      let step = periodMs; // one hit per beat
      // increase density on harder difficulties
      if (diff.name === 'Hard') step = periodMs / 2; // 8th notes
      else if (diff.name === 'Normal') step = periodMs * 0.75;
      else if (diff.name === 'Easy') step = periodMs; // beats
      else step = Math.min(periodMs * 1.25, 450); // Very Easy

      let idx = 0;
      for (let t = t0; t <= end; t += step) {
        const lane = pattern[idx % pattern.length];
        notes.push({ timeMs: t, lane });
        idx++;
      }
    }

    // Beat grid for UI
    let beats = [];
    if (tempo && tempo.periodMs > 0) {
      const period = tempo.periodMs;
      const anchor = peaks.length ? peaks[0] : 0;
      let t0 = anchor;
      while (t0 - period >= 0) t0 -= period;
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
      beats,
      method: 'chord_v15'
    };

    const playChartBtn = window.RG.Dom.playChartBtn;
    if (playChartBtn) playChartBtn.disabled = notes.length === 0;
    if (statusEl) {
      statusEl.textContent = notes.length
        ? `Chart ready (Chord v1.5, ${diff.name}, ${notes.length} notes). Click Start to play.`
        : 'Chord v1.5: sensitivity may be too low. Try Easy/Hard or another file.';
    }
  }

  window.RG.Chords = { precomputeChordChartFromFileV15 };
})();