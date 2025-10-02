(() => {
  function getDifficulty() {
    // Prefer persisted/app-level setting
    if (window.RG && window.RG.Settings && window.RG.Settings.getDifficulty) {
      return window.RG.Settings.getDifficulty() || 'normal';
    }
    // Fallback to any legacy on-page select if present
    const el = window.RG.Dom && window.RG.Dom.difficultySelect;
    const v = (el && el.value) || 'normal';
    return (v === 'veryeasy' || v === 'easy' || v === 'hard') ? v : 'normal';
  }

  function getDifficultyParams() {
    const d = getDifficulty();
    if (d === 'veryeasy') {
      return {
        name: 'Very Easy',
        threshK: 1.8,
        minSpacingMs: 320,
        smoothRadius: 5,
        threshWindow: 52
      };
    } else if (d === 'easy') {
      return {
        name: 'Easy',
        threshK: 1.6,
        minSpacingMs: 260,
        smoothRadius: 4,
        threshWindow: 48
      };
    } else if (d === 'hard') {
      return {
        name: 'Hard',
        threshK: 1.0,
        minSpacingMs: 100,
        smoothRadius: 2,
        threshWindow: 36
      };
    }
    return {
      name: 'Normal',
      threshK: 1.2,
      minSpacingMs: 160,
      smoothRadius: 3,
      threshWindow: 40
    };
  }

  function getActiveLaneIndices() {
    const d = getDifficulty();
    return d === 'veryeasy' ? [0, 2, 4] : [0, 1, 2, 3, 4];
  }

  window.RG.Difficulty = { getDifficulty, getDifficultyParams, getActiveLaneIndices };
})();