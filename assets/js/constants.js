(() => {
  const c = {
    // Online analysis settings
    ANALYSIS_DELAY_MS: 3000,   // ms lookahead before scheduling visible notes (3s lag for streaming)
    FFT_SIZE: 2048,            // analyser FFT size
    ANALYSIS_HOP_MS: 20,       // how often we analyze (approx)
    MIN_ONSET_INTERVAL_MS: 120, // refractory period for onsets
    THRESH_WINDOW: 30,         // flux history window size (samples)
    THRESH_K: 1.5,             // threshold multiplier

    // Offline precompute (chart) settings
    CHART_FRAME_SIZE: 1024,
    CHART_HOP_SIZE: 512,
    CHART_THRESH_WINDOW: 40,   // frames
    CHART_THRESH_K: 1.2,
    CHART_MIN_SPACING_MS: 120,

    // Key layout
    KEY_ORDER: ['z','s','x','d','c'],
    KEY_TO_LANE: { z: 0, s: 1, x: 2, d: 3, c: 4 },
    LANE_TYPES: ['white', 'black', 'white', 'black', 'white'],

    // Gameplay visuals
    NOTE_H: 24,          // px
    SPEED: 420,          // px/s
    PERFECT_DIST: 12,    // px to hit-line
    GOOD_DIST: 30,
    OKAY_DIST: 56,
    KEYCAPS_H: 120       // must match CSS --keycaps-h
  };

  window.RG.Const = c;
})();