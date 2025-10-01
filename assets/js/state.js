(() => {
  const { KEYCAPS_H } = window.RG.Const;
  const { playfield } = window.RG.Dom;

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
      mode: 'live',       // 'live' | 'file' | 'chart'
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

  function measure(state) {
    const pfRect = playfield.getBoundingClientRect();
    state.hitY = pfRect.height - KEYCAPS_H - 12;
  }

  function clearNotes(state) {
    state.notes.forEach(n => n.el && n.el.remove());
    state.notes.length = 0;
  }

  window.RG.State = { resetState, measure, clearNotes, state: null };
})();