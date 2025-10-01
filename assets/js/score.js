(() => {
  const { scoreValueEl } = window.RG.Dom;

  const BASE_POINTS = {
    perfect: 200,
    good: 100,
    okay: 50
  };

  // Small per-hit bonus that rewards maintaining combo.
  // Tiers align with visual combo effects.
  function comboBonus(combo) {
    if (combo >= 200) return 50;
    if (combo >= 150) return 40;
    if (combo >= 100) return 30;
    if (combo >= 50) return 20;
    if (combo >= 20) return 10;
    if (combo >= 10) return 5;
    return 0;
  }

  function updateUI(state) {
    if (!scoreValueEl) return;
    const v = state && typeof state.score === 'number' ? state.score : 0;
    scoreValueEl.textContent = String(v);
  }

  function add(state, judgement) {
    const base = BASE_POINTS[judgement] || 0;
    const bonus = comboBonus(state.combo || 0);
    state.score = (state.score || 0) + base + bonus;
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
    comboBonus
  };
})();