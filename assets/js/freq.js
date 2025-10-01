(() => {
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

  function mel(f) { return 1127 * Math.log(1 + f / 700); }
  function invMel(m) { return 700 * (Math.exp(m / 1127) - 1); }

  function getBandEdges(sampleRate, minHz, maxHz, bandCount = 5) {
    const key = sampleRate + ':' + minHz + ':' + maxHz + ':' + bandCount;
    let edges = _cache.edges[key];
    if (edges) return edges;
    const nyquist = sampleRate / 2;
    const lo = Math.max(60, Math.min(minHz, nyquist));
    const hi = Math.max(lo + 10, Math.min(maxHz, nyquist));
    const melLo = mel(lo), melHi = mel(hi);
    edges = new Float32Array(bandCount + 1);
    for (let i = 0; i <= bandCount; i++) {
      const m = melLo + (melHi - melLo) * (i / bandCount);
      edges[i] = invMel(m);
    }
    _cache.edges[key] = edges;
    return edges;
  }

  window.RG.Freq = { getHann, getKIndex, goertzelPower, mel, invMel, getBandEdges, _cache };
})();