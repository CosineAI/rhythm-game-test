(() => {
  const { KEYCAPS_H } = window.RG.Const;
  const { playfield } = window.RG.Dom;

  function resetState() {
    return {
      running: false,
      paused: false,
      pauseStartTs: 0,
      ended: false,
      startAt: 0,
      lastTs: 0,
      hitY: 0,
      nextSpawnIdx: 0,
      schedule: [],      // { t: msFromStart, lane }
      notes: [],         // { lane, el, spawnAt, y, judged }
      // Beat grid (experimental)
      beatSchedule: [],  // { t: msFromStart, strong }
      nextBeatIdx: 0,
      beatLines: [],     // { el, spawnAt, y }
      counts: { perfect: 0, good: 0, okay: 0, miss: 0 },
      score: 0,
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

    // Also clear beat grid lines if present
    if (state.beatLines && state.beatLines.length) {
      state.beatLines.forEach(b => b.el && b.el.remove());
      state.beatLines.length = 0;
    }
    state.beatSchedule = [];
    state.nextBeatIdx = 0;
  }

  window.RG.State = { resetState, measure, clearNotes, state: null };
})();