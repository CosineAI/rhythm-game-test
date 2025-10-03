(() => {
  const {
    keycapByLane,
    difficultySelect,
    fileInput,
    analyzeBtn,
    playChartBtn,
    statusEl
  } = window.RG.Dom;

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function hitLane(state, lane) {
    if (!state.running) return;
    const { note, dist } = window.RG.Notes.pickCandidate(state, lane);
    const j = note ? window.RG.Notes.judge(dist) : null;

    if (note) {
      if (j) {
        note.judged = true;
        note.el.classList.add('hit');
        setTimeout(() => note.el && note.el.remove(), 180);
        state.counts[j]++;
        window.RG.UI.flash(capitalize(j), j);
        window.RG.UI.triggerGlow(lane);
        window.RG.UI.screenShake();
        window.RG.UI.comboHit(state);
        if (window.RG.Score && window.RG.Score.add) {
          window.RG.Score.add(state, j);
        }
      } else {
        // There is a note in this column, but timing was outside windows -> Miss
        window.RG.UI.flash('Miss', 'miss');
        state.counts.miss++;
        window.RG.UI.comboMiss(state);
      }
    } else {
      // No notes in this column -> no penalty and no Miss flash
    }
  }

  function init() {
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const state = window.RG.State.state;
      if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (state.running) window.RG.Game.pause(state);
        else if (state.paused) window.RG.Game.resume(state);
        return;
      }
      const map = (window.RG.Settings && window.RG.Settings.getKeyToLane && window.RG.Settings.getKeyToLane()) || {};
      const lane = map[key];
      if (lane !== undefined) {
        if (!e.repeat) {
          const active = window.RG.Difficulty.getActiveLaneIndices();
          if (!active.includes(lane)) return;
          const cap = keycapByLane && keycapByLane[lane];
          if (cap) cap.classList.add('active');
          hitLane(state, lane);
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      const map = (window.RG.Settings && window.RG.Settings.getKeyToLane && window.RG.Settings.getKeyToLane()) || {};
      const lane = map[key];
      if (lane !== undefined) {
        const cap = keycapByLane && keycapByLane[lane];
        if (cap) cap.classList.remove('active');
      }
    });

    // Pointer/touch support: allow tapping lanes to hit notes (mobile-friendly)
    const { lanes } = window.RG.Dom;
    if (lanes && lanes.length) {
      lanes.forEach((laneEl, lane) => {
        if (!laneEl) return;

        const onDown = (e) => {
          const active = window.RG.Difficulty.getActiveLaneIndices();
          if (!active.includes(lane)) return;
          e.preventDefault();
          const state = window.RG.State.state;
          const cap = keycapByLane && keycapByLane[lane];
          if (cap) cap.classList.add('active');
          hitLane(state, lane);
          try { if (laneEl.setPointerCapture) laneEl.setPointerCapture(e.pointerId); } catch {}
        };
        const onUp = () => {
          const cap = keycapByLane && keycapByLane[lane];
          if (cap) cap.classList.remove('active');
        };

        laneEl.addEventListener('pointerdown', onDown);
        laneEl.addEventListener('pointerup', onUp);
        laneEl.addEventListener('pointercancel', onUp);
        laneEl.addEventListener('pointerleave', onUp);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const state = window.RG.State.state;
        const f = fileInput.files && fileInput.files[0];
        // Reset any previous chart when selecting a new file
        if (state.precomputedChart) {
          state.precomputedChart = null;
        }
        if (analyzeBtn) analyzeBtn.disabled = !f;
        if (playChartBtn) playChartBtn.disabled = true;

        if (f) {
          const diff = window.RG.Difficulty.getDifficultyParams().name;
          statusEl.textContent = `Selected: ${f.name} — Difficulty: ${diff}. Click “Analyze” to precompute a chart, or press Play for live analysis.`;
        } else {
          statusEl.textContent = 'No file selected — Play will start microphone live mode.';
        }
      });
    }

    if (difficultySelect) {
      difficultySelect.addEventListener('change', () => {
        const state = window.RG.State.state;
        window.RG.UI.applyKeyLayout();
        const f = fileInput.files && fileInput.files[0];
        if (f) {
          const diff = window.RG.Difficulty.getDifficultyParams().name;
          // Invalidate existing chart if difficulty changed
          if (state.precomputedChart && state.precomputedChart.fileName === f.name && state.precomputedChart.difficulty !== diff) {
            state.precomputedChart = null;
            if (playChartBtn) playChartBtn.disabled = true;
          }
          if (analyzeBtn) analyzeBtn.disabled = !f;
          statusEl.textContent = `Selected: ${f.name} — Difficulty: ${diff}. Click “Analyze” to precompute a chart, or press Play for live analysis.`;
        }
      });
    }

    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', async () => {
        const state = window.RG.State.state;
        const f = fileInput.files && fileInput.files[0];
        if (!f) {
          statusEl.textContent = 'Choose a file first.';
          return;
        }
        analyzeBtn.disabled = true;
        try {
          await window.RG.Chart.precomputeChartFromFile(state, f);
          playChartBtn.disabled = !(state.precomputedChart && state.precomputedChart.notes.length);
        } catch (e) {
          console.error(e);
          statusEl.textContent = 'Analysis failed.';
        } finally {
          analyzeBtn.disabled = false;
        }
      });
    }

    if (playChartBtn) {
      playChartBtn.addEventListener('click', async () => {
        const state = window.RG.State.state;
        const f = fileInput.files && fileInput.files[0];
        if (!f || !state.precomputedChart) {
          statusEl.textContent = 'Analyze a file first.';
          return;
        }
        if (state.running) {
          window.RG.Game.endGame(state);
          return;
        }
        state.preferChartOnStart = true;
        await window.RG.Game.startGame(state);
      });
    }
  }

  window.RG.Input = { init };
})();