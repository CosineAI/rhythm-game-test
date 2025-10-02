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
    statusEl,
    setupSongName
  } = window.RG.Dom;

  // Optional label for file input
  const setupFileLabel = document.getElementById('setupFileLabel');

  let selectedFile = null;

  function openSetup(opts = {}) {
    const state = window.RG.State.state;
    if (opts.reset) {
      selectedFile = null;
      if (state) {
        state.precomputedChart = null;
        state._selectedFile = null;
      }
      if (setupFile) setupFile.value = '';
      if (setupFileLabel) setupFileLabel.textContent = 'Select audio file…';
      if (setupSongName) {
        setupSongName.textContent = '';
        setupSongName.removeAttribute('title');
      }
      if (setupStart) setupStart.disabled = true;
    }

    if (!setupModal) return;
    // Prefill difficulty from settings
    const d = window.RG.Settings.getDifficulty();
    if (setupDifficulty) setupDifficulty.value = d;

    // Hide results modal if it happens to be open
    const results = document.getElementById('resultsModal');
    if (results) {
      results.classList.add('hidden');
      results.setAttribute('aria-hidden', 'true');
    }

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
      // Remember selection on state for replay
      state._selectedFile = selectedFile;
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
        if (state) {
          state.precomputedChart = null;
          state._selectedFile = selectedFile || null;
        }
        if (setupStart) setupStart.disabled = true;

        // Keep the file button label constant; show selection in fixed container
        if (setupFileLabel) {
          setupFileLabel.textContent = 'Select audio file…';
        }
        if (setupSongName) {
          const name = selectedFile ? selectedFile.name : '';
          setupSongName.textContent = name;
          if (name) setupSongName.setAttribute('title', name);
          else setupSongName.removeAttribute('title');
        }

        if (statusEl) {
          if (selectedFile) statusEl.textContent = `Selected: ${selectedFile.name}`;
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
          statusEl.textContent = `Selected: ${selectedFile.name} — Difficulty: ${diff}.`;
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
        let state = window.RG.State.state;
        if (!selectedFile || !state.precomputedChart) {
          if (statusEl) statusEl.textContent = 'Generate a chart first.';
          return;
        }
        // Fully reset to a fresh run (keep the computed chart)
        state = window.RG.Game.resetForNewRun(state, { keepChart: true });
        closeSetup();
        await window.RG.UI.countdownThen(state, async () => {
          await window.RG.Game.startChartPlayback(state, selectedFile);
        });
      });
    }

    // Setup modal: open Settings
    if (setupOpenSettings) {
      setupOpenSettings.addEventListener('click', () => {
        const { settingsModal } = window.RG.Dom;
        if (!settingsModal) return;
        // Flag sliding mode
        window.RG.Settings._slideWithSetup = true;
        // Use stacked mode to hide settings backdrop
        settingsModal.classList.add('slide-stacked');
        window.RG.Settings.openModal();

        const settingsPanel = settingsModal.querySelector('.modal-panel');
        const setupPanel = setupModal ? setupModal.querySelector('.modal-panel.setup') : null;

        if (settingsPanel && setupPanel) {
          // Prepare classes
          setupPanel.classList.remove('slide-in-left');
          // Force reflow
          void setupPanel.offsetWidth;
          // Animate: setup out left, settings in right
          setupPanel.classList.add('slide-out-left');
          // Force reflow for settings
          void settingsPanel.offsetWidth;
          settingsPanel.classList.add('slide-in-right');
        }
      });
    }

    // New top-level buttons
    if (newSongBtn) {
      newSongBtn.addEventListener('click', () => {
        const state = window.RG.State.state;
        if (state && state.running) {
          window.RG.Game.endGame(state, { showResults: false });
        }
        openSetup({ reset: true });
      });
    }
    if (pausePlayBtn) {
      pausePlayBtn.addEventListener('click', async () => {
        const state = window.RG.State.state;
        if (state.running) {
          window.RG.Game.endGame(state, { showResults: false });
        } else {
          // If we have a precomputed chart and (optionally) a remembered file via setup modal, start it
          // Otherwise open setup
          if (state.precomputedChart && (selectedFile || state._selectedFile)) {
            const file = selectedFile || state._selectedFile;
            await window.RG.UI.countdownThen(state, async () => {
              await window.RG.Game.startChartPlayback(state, file);
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

  // Expose open so results modal can navigate here
  window.RG.Setup = {
    open: openSetup
  };

  // Initialize setup once everything else is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();