(() => {
  // Initialize settings (load persisted difficulty/input offset and wire modal)
  if (window.RG.Settings && window.RG.Settings.init) {
    window.RG.Settings.init();
  }

  // Initialize state
  window.RG.State.state = window.RG.State.resetState();

  // Apply key layout based on initial difficulty
  window.RG.UI.applyKeyLayout();

  // Measure playfield hit-line
  window.RG.State.measure(window.RG.State.state);
  window.addEventListener('resize', () => window.RG.State.measure(window.RG.State.state));

  // Wire up input handlers
  window.RG.Input.init();
})();