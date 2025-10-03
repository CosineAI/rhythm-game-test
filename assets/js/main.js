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
  // Initialize hit-line fire effect at 0
  if (window.RG.UI && window.RG.UI.updateHitLineFire) {
    window.RG.UI.updateHitLineFire(window.RG.State.state);
  }
  window.addEventListener('resize', () => window.RG.State.measure(window.RG.State.state));

  // Wire up input handlers
  window.RG.Input.init();

  // Prevent page scroll on mobile (allow interactions within modals)
  if (navigator.maxTouchPoints > 0) {
    const allowInModal = (el) => el && el.closest && el.closest('.modal-panel');
    window.addEventListener('touchmove', (e) => {
      const t = e.target;
      if (allowInModal(t)) return;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
  }
})();