(() => {
  const { getHann, getKIndex, goertzelPower, getBandEdges } = window.RG.Freq;

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

  function laneFromBandsAt(samples, sampleRate, timeMs, laneIndices) {
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

    const bandCount = Math.max(1, (laneIndices && laneIndices.length) || 5);
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

    const weights = (bandCount === 3) ? [1.0, 1.05, 1.12]
                    : (bandCount === 5) ? [1.0, 1.0, 1.05, 1.12, 1.18]
                    : new Array(bandCount).fill(1.0);

    let best = -1, bestVal = -1, sum = 0;
    for (let i = 0; i < bandCount; i++) {
      sum += energies[i];
      const v = energies[i] * weights[i];
      if (v > bestVal) { bestVal = v; best = i; }
    }
    if (sum <= 1e-9) return null;
    const lanesArr = laneIndices && laneIndices.length ? laneIndices : [0,1,2,3,4];
    return lanesArr[best] ?? null;
  }

  window.RG.Algo = {
    computeRmsEnvelope,
    smoothInPlace,
    pickPeaks,
    laneFromCentroidAt,
    laneFromBandsAt
  };
})();