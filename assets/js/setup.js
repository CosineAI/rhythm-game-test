(() => {
  const {
    setupModal,
    setupFile,
    setupDifficulty,
    setupGenerate,
    setupStart,
    setupOpenSettings,
    newSongBtn,
    pausePlayBtn,
    statusEl
  } = window.RG.Dom;

  let selectedFile = null;

  function openSetup() {
    if (!setupModal) return;
    // Prefill difficulty from settings
    const d = window.RG.Settings.getDifficulty();
    if (setupDifficulty) setupDifficulty.value = d;

    setupModal.classList.remove('hidden');
    setupModal.setAttribute('aria-hidden', 'false');
  }

  function closeSetup() {
    if (!setupModal) return;
    setupModal.classList.add('hidden');
    setupModal.setAttribute('aria-hidden', 'true');
  }

  async function generateChart() {
    const state = window.RG.State.state;
    if (!selectedFile) {
      if (statusEl) statusEl.textContent = 'Choose a file first.';
      return;
    }
    if (setupStart) setupStart.disabled = true;
    try {
      await window.RG.Chart.precomputeChartFromFile(state, selectedFile);
      if (statusEl) {
        const diff = window.RG.Difficulty.getDifficultyParams().name;
        statusEl.textContent = `Chart ready: ${selectedFile.name} — ${diff} (${state.precomputedChart && state.precomputedChart.notes ? state.precomputedChart.notes.length : 0} notes).`;
      }
      if (setupStart) setupStart.disabled = !(state.precomputedChart && state.precomputedChart.notes && state.precomputedChart.notes.length);
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = 'Chart generation failed.';
    }
  }

  function init() {
    // Wire setup UI
    if (setupFile) {
      setupFile.addEventListener('change', () => {
        const f = setupFile.files && setupFile.files[0];
        selectedFile = f || null;
        // Invalidate previous chart on file change
        const state = window.RG.State.state;
        if (state) state.precomputedChart = null;
        if (setupStart) setupStart.disabled = true;
        if (statusEl) {
          if (selectedFile) statusEl.textContent = `Selected: ${selectedFile.name}. Click Generate to precompute a chart.`;
          else statusEl.textContent = 'No file selected.';
        }
      });
    }

    if (setupDifficulty) {
      setupDifficulty.addEventListener('change', () => {
        const val = setupDifficulty.value;
        window.RG.Settings.setDifficulty(val);
        window.RG.UI.applyKeyLayout();
        // Invalidate chart on difficulty change
        const state = window.RG.State.state;
        if (state) state.precomputedChart = null;
        if (setupStart) setupStart.disabled = true;
        if (statusEl && selectedFile) {
          const diff = window.RG.Difficulty.getDifficultyParams().name;
          statusEl.textContent = `Selected: ${selectedFile.name} — Difficulty: ${diff}. Click Generate to precompute a chart.`;
        }
      });
    }

    if (setupGenerate) {
      setupGenerate.addEventListener('click', async () => {
        await generateChart();
      });
    }

    if (setupStart) {
      setupStart.addEventListener('click', async () => {
        const state = window.RG.State.state;
        if (!selectedFile || !state.precomputedChart) {
          if (statusEl) statusEl.textContent = 'Generate a chart first.';
          return;
        }
        closeSetup();
        await window.RG.UI.countdownThen(state, async () => {
          await window.RG.Game.startChartPlayback(state, selectedFile);
        });
      });
    }

    // Setup modal: open Settings
    if (setupOpenSettings) {
      setupOpenSettings.addEventListener('click', () => {
        window.RG.Settings.openModal();
      });
    }

    // New top-level buttons
    if (newSongBtn) {
      newSongBtn.addEventListener('click', () => {
        openSetup();
      });
    }
    if (pausePlayBtn) {
      pausePlayBtn.addEventListener('click', async () => {
        const state = window.RG.State.state;
        if (state.running) {
          window.RG.Game.endGame(state);
        } else {
          // If we have a precomputed chart and (optionally) a remembered file via setup modal, start it
          // Otherwise open setup
          if (state.precomputedChart && selectedFile) {
            await window.RG.UI.countdownThen(state, async () => {
              await window.RG.Game.startChartPlayback(state, selectedFile);
            });
          } else {
            openSetup();
          }
        }
      });
    }

    // Open setup on load
    openSetup();

    // Also close if backdrop is clicked
    if (setupModal) {
      setupModal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close')) {
          // Keep modal open on accidental click; require explicit Start to proceed
          openSetup();
        }
      });
    }
  }

  // Initialize setup once everything else is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();