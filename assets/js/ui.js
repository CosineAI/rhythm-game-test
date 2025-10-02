(() => {
  const {
    playfield,
    judgementEl,
    lanes,
    lanesContainer,
    keycapsContainer,
    keycapByLane,
    comboEl,
    comboValueEl,
    comboToastEl,
    resultsModal,
    resultsReplay,
    resultsNewSong,
    resultPerfect,
    resultGood,
    resultOkay,
    resultBad,
    resultMaxCombo,
    resultTotalScore
  } = window.RG.Dom;

  function flash(text, cls) {
    judgementEl.textContent = text;
    judgementEl.className = `judgement show ${cls}`;
    clearTimeout(judgementEl._t);
    judgementEl._t = setTimeout(() => {
      judgementEl.className = 'judgement';
    }, 420);
  }

  function triggerGlow(lane) {
    const laneEl = lanes[lane];
    if (!laneEl) return;
    const glow = document.createElement('div');
    glow.className = 'glow';
    laneEl.appendChild(glow);
    glow.addEventListener('animationend', () => glow.remove(), { once: true });
  }

  function screenShake() {
    playfield.classList.remove('shake');
    void playfield.offsetWidth;
    playfield.classList.add('shake');
    playfield.addEventListener('animationend', () => {
      playfield.classList.remove('shake');
    }, { once: true });
  }

  // Combo system
  function comboBurst(state) {
    if (!playfield) return;
    const b = document.createElement('div');
    b.className = 'burst';

    // Scale glow size and (slightly) duration by combo tiers
    let mid = 6.0, end = 9.0, dur = '680ms';
    if (state.combo >= 200) { mid = 16.0; end = 24.0; dur = '800ms'; }
    else if (state.combo >= 150) { mid = 13.0; end = 19.0; dur = '780ms'; }
    else if (state.combo >= 100) { mid = 11.0; end = 16.0; dur = '760ms'; }
    else if (state.combo >= 50) { mid = 9.0; end = 13.0; dur = '720ms'; }
    else if (state.combo >= 20) { mid = 7.5; end = 11.0; dur = '700ms'; }

    b.style.setProperty('--burst-start', '0.4');
    b.style.setProperty('--burst-mid', String(mid));
    b.style.setProperty('--burst-end', String(end));
    b.style.setProperty('--burst-duration', dur);

    playfield.appendChild(b);
    b.addEventListener('animationend', () => b.remove(), { once: true });
  }

  function flashComboCount(state) {
    if (!comboToastEl) return;
    const text = `${state.combo} combo!`;
    comboToastEl.textContent = text;
    comboToastEl.classList.remove('show');
    void comboToastEl.offsetWidth;
    comboToastEl.classList.add('show');
    clearTimeout(comboToastEl._t);
    comboToastEl._t = setTimeout(() => {
      comboToastEl.classList.remove('show');
    }, 560);
  }

  function updateComboUI(state, { pop = false, bump = false } = {}) {
    if (!comboEl || !comboValueEl) return;
    comboValueEl.textContent = String(state.combo);

    // Ensure the combo is visible once threshold is reached
    if (state.combo >= 10 && !comboEl.classList.contains('show')) {
      comboEl.classList.add('show');
    }

    // On first reveal, let the pop animation play cleanly
    if (pop) {
      comboEl.classList.remove('bump');
      void comboEl.offsetWidth;
    }

    // Bump animation for continued hits
    if (bump && comboEl.classList.contains('show')) {
      comboEl.classList.remove('bump');
      // restart bump animation
      void comboEl.offsetWidth;
      comboEl.classList.add('bump');
    }
  }

  function comboHit(state) {
    state.combo = (state.combo || 0) + 1;
    state.maxCombo = Math.max(state.maxCombo || 0, state.combo);

    if (state.combo >= 10) {
      const firstShow = !comboEl || !comboEl.classList || !comboEl.classList.contains('show');
      updateComboUI(state, { pop: firstShow, bump: !firstShow || state.combo > 10 });
      // Per-hit combo toast
      flashComboCount(state);
      // Burst glow on every combo >= 10
      comboBurst(state);
    } else {
      // Pre-10: keep value in sync (not visible yet)
      updateComboUI(state);
    }
  }

  function comboMiss(state) {
    if (state.combo >= 10 && comboEl) {
      comboEl.classList.remove('show');
      comboEl.classList.remove('bump');
    }
    if (comboToastEl) {
      comboToastEl.classList.remove('show');
      clearTimeout(comboToastEl._t);
    }
    state.combo = 0;
  }

  function applyKeyLayout() {
    const d = window.RG.Difficulty.getDifficulty();
    if (d === 'veryeasy') {
      if (lanesContainer) lanesContainer.classList.add('three');
      if (keycapsContainer) keycapsContainer.classList.add('three');
      // hide black lanes and keycaps
      for (const laneEl of lanes) {
        if (laneEl.classList.contains('black')) laneEl.classList.add('hidden');
        else laneEl.classList.remove('hidden');
      }
      for (const el of keycapByLane) {
        if (!el) continue;
        if (el.classList.contains('black')) el.classList.add('hidden');
        else el.classList.remove('hidden');
      }
    } else {
      if (lanesContainer) lanesContainer.classList.remove('three');
      if (keycapsContainer) keycapsContainer.classList.remove('three');
      for (const laneEl of lanes) {
        laneEl.classList.remove('hidden');
      }
      for (const el of keycapByLane) {
        if (el) el.classList.remove('hidden');
      }
    }
  }

  function refreshKeycapLabels() {
    if (!keycapByLane) return;
    const binds = (window.RG.Settings && window.RG.Settings.getKeyBindings && window.RG.Settings.getKeyBindings()) || ['z','s','x','d','c'];
    for (let i = 0; i < keycapByLane.length && i < binds.length; i++) {
      const el = keycapByLane[i];
      const span = el ? el.querySelector('span') : null;
      if (span) span.textContent = String(binds[i]).toUpperCase();
    }
  }

  // Results modal
  function showResults(state) {
    if (!resultsModal) return;
    // Populate values
    if (resultPerfect) resultPerfect.textContent = String(state.counts.perfect || 0);
    if (resultGood) resultGood.textContent = String(state.counts.good || 0);
    if (resultOkay) resultOkay.textContent = String(state.counts.okay || 0);
    if (resultBad) resultBad.textContent = String(state.counts.miss || 0);
    if (resultMaxCombo) resultMaxCombo.textContent = String(state.maxCombo || 0);
    if (resultTotalScore) resultTotalScore.textContent = String(state.score || 0);

    resultsModal.classList.remove('hidden');
    resultsModal.setAttribute('aria-hidden', 'false');

    // Handlers
    const backdrop = resultsModal.querySelector('.modal-backdrop');
    function close() {
      resultsModal.classList.add('hidden');
      resultsModal.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.addEventListener('click', close, { once: true });

    if (resultsReplay) {
      resultsReplay.addEventListener('click', async () => {
        close();
        let s = window.RG.State.state;
        // Ensure we have a chart and file to replay
        if (s && s.precomputedChart && s._selectedFile) {
          const file = s._selectedFile; // cache before reset
          // Fresh run: reset state and score while keeping the chart and file
          s = window.RG.Game.resetForNewRun(s, { keepChart: true, keepSelectedFile: true });
          await window.RG.UI.countdownThen(s, async () => {
            await window.RG.Game.startChartPlayback(s, file);
          });
        } else {
          // Fallback: open setup if we can't replay
          if (window.RG.Setup && window.RG.Setup.open) {
            window.RG.Setup.open({ reset: true });
          }
        }
      }, { once: true });
    }

    if (resultsNewSong) {
      resultsNewSong.addEventListener('click', () => {
        close();
        const s = window.RG.State.state;
        // Hard stop and clear chart/file references without showing results again
        try { window.RG.Game.endGame(s, { showResults: false }); } catch {}
        if (s) {
          s.precomputedChart = null;
          s._selectedFile = null;
        }
        // Open setup modal
        if (window.RG.Setup && window.RG.Setup.open) {
          window.RG.Setup.open({ reset: true });
        } else {
          const btn = document.getElementById('newSongBtn');
          if (btn) btn.click();
        }
      }, { once: true });
    }
  }

  async function countdownThen(state, fn) {
    // Use the judgement element for a simple central countdown
    const steps = ['3', '2', '1', 'Start!'];
    for (let i = 0; i < steps.length; i++) {
      flash(steps[i], i < steps.length - 1 ? 'good' : 'perfect');
      await new Promise(r => setTimeout(r, i < steps.length - 1 ? 800 : 600));
    }
    // Clear
    if (judgementEl) judgementEl.className = 'judgement';
    await fn();
  }

  window.RG.UI = {
    flash,
    triggerGlow,
    screenShake,
    comboBurst,
    flashComboCount,
    updateComboUI,
    comboHit,
    comboMiss,
    applyKeyLayout,
    refreshKeycapLabels,
    showResults,
    countdownThen
  };
})();