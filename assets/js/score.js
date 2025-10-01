(() => {
  const { scoreValueEl } = window.RG.Dom;

  const BASE_POINTS = {
    perfect: 200,
    good: 100,
    okay: 50
  };

  // Combo multiplier: +1% per combo, capped to keep numbers reasonable.
  // Examples:
  //   10 combo  -> 1.10x
  //   50 combo  -> 1.50x
  //   100 combo -> 2.00x
  //   200 combo -> 3.00x (cap)
  function comboMultiplier(combo) {
    const m = 1 + 0.01 * (combo || 0);
    return Math.min(m, 3.0);
  }

  function updateUI(state) {
    if (!scoreValueEl) return;
    const v = state && typeof state.score === 'number' ? state.score : 0;
    scoreValueEl.textContent = String(v);
  }

  function add(state, judgement) {
    const base = BASE_POINTS[judgement] || 0;
    const mult = comboMultiplier(state.combo || 0);
    state.score = (state.score || 0) + Math.round(base * mult);
    updateUI(state);
  }

  function reset(state) {
    state.score = 0;
    updateUI(state);
  }

  window.RG.Score = {
    add,
    reset,
    updateUI,
    comboMultiplier
  };
})();