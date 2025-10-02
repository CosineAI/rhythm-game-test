(() => {
  const { statusEl, audioEl, playChartBtn, fileInput } = window.RG.Dom;
  const { measure, clearNotes } = window.RG.State;

  function resetForNewRun(state, { keepChart = true, keepSelectedFile = keepChart } = {}) {
    const prevChart = keepChart ? state.precomputedChart : null;
    const prevFile = keepSelectedFile ? state._selectedFile : null;
    clearNotes(state);
    window.RG.State.state = Object.assign(window.RG.State.resetState(), {});
    const st = window.RG.State.state;
    st.precomputedChart = prevChart;
    st._selectedFile = prevFile;
    measure(st);
    if (window.RG.Score && window.RG.Score.reset) window.RG.Score.reset(st);
    return st;
  }

  async function startChartPlayback(state, file) {
    state.mode = 'chart';

    try {
      await window.RG.Audio.setupFileAudio(state, file);
    } catch (err) {
      console.error('Audio file error:', err);
      statusEl.textContent = 'Could not load audio file.';
      return;
    }

    // Build schedule from precomputed chart
    const chart = state.precomputedChart;
    if (!chart || !chart.notes || !chart.notes.length) {
      statusEl.textContent = 'No chart available. Analyze first.';
      return;
    }

    const travelDist = Math.max(0, state.hitY - (window.RG.Const.NOTE_H / 2));
    const speedMult = (window.RG.Settings && window.RG.Settings.getFallSpeedMult) ? window.RG.Settings.getFallSpeedMult() : 1.0;
    const speed = window.RG.Const.SPEED * speedMult;
    const travelTimeMs = (travelDist / speed) * 1000;
    const userOffsetMs = (window.RG.Settings && window.RG.Settings.getInputOffsetMs()) || 0;

    state.schedule = chart.notes.map(n => ({
      t: Math.max(0, (n.timeMs + userOffsetMs) - travelTimeMs),
      lane: n.lane
    }));
    state.schedule.sort((a, b) => a.t - b.t);
    state.nextSpawnIdx = 0;

    // Build beat grid schedule (experimental)
    state.beatSchedule = [];
    state.nextBeatIdx = 0;
    if (window.RG.Settings && window.RG.Settings.getGridlinesEnabled && window.RG.Settings.getGridlinesEnabled()) {
      const beats = Array.isArray(chart.beats) ? chart.beats : [];
      for (let i = 0; i < beats.length; i++) {
        const t = beats[i];
        state.beatSchedule.push({
          t: Math.max(0, (t + userOffsetMs) - travelTimeMs),
          strong: (i % 4 === 0)
        });
      }
    }

    try {
      await state.audioCtx.resume();
      await audioEl.play();
    } catch (err) {
      console.error('Playback error:', err);
      statusEl.textContent = 'Playback blocked. Click the page and press Space again.';
      return;
    }

    state.startAt = performance.now();
    state.audioBaseTime = state.audioCtx.currentTime;

    state.running = true;
    state.ended = false;
    const bpmText = chart.bpm ? ` • ~${Math.round(chart.bpm)} BPM` : '';
    statusEl.textContent = `Chart mode: playing ${file.name} — ${chart.difficulty || 'Normal'} (${chart.notes.length} notes${bpmText})`;

    const onEnded = () => endGame(state);
    audioEl.addEventListener('ended', onEnded, { once: true });

    state.raf = requestAnimationFrame(ts => tick(state, ts));
  }

  async function startGame(state) {
    if (state.running) return;

    // Reset to fresh run but preserve any precomputed chart
    state = resetForNewRun(state, { keepChart: true });

    const file = fileInput && fileInput.files && fileInput.files[0];
    const hasChart = !!(file && state.precomputedChart && state.precomputedChart.fileName === file.name);

    if (hasChart && (state.preferChartOnStart || true)) {
      state.preferChartOnStart = false;
      await startChartPlayback(state, file);
      return;
    }

    if (file) {
      state.mode = 'file';
      try {
        await window.RG.Audio.setupFileAudio(state, file);
      } catch (err) {
        console.error('Audio file error:', err);
        statusEl.textContent = 'Could not load audio file.';
        return;
      }
      try {
        await state.audioCtx.resume();
        await audioEl.play();
      } catch (err) {
        console.error('Playback error:', err);
        statusEl.textContent = 'Playback blocked. Click the page and press Space again.';
        return;
      }

      state.startAt = performance.now();
      state.audioBaseTime = state.audioCtx.currentTime;
      state.running = true;
      state.ended = false;
      statusEl.textContent = `File mode (live analysis): ${file.name} (delay ${window.RG.Const.ANALYSIS_DELAY_MS} ms)`;

      const onEnded = () => endGame(state);
      audioEl.addEventListener('ended', onEnded, { once: true });

      state.analysisTimer = setInterval(() => window.RG.Analysis.analyzeStep(state), window.RG.Const.ANALYSIS_HOP_MS);
      state.raf = requestAnimationFrame(ts => tick(state, ts));
    } else {
      state.mode = 'live';
      try {
        await window.RG.Audio.setupLiveAudio(state);
      } catch (err) {
        console.error('Microphone error:', err);
        statusEl.textContent = 'Mic blocked/unavailable. Live mode requires microphone access.';
        return;
      }

      state.startAt = performance.now();
      state.audioBaseTime = state.audioCtx.currentTime;

      state.running = true;
      state.ended = false;
      statusEl.textContent = `Live mode: listening (delay ${window.RG.Const.ANALYSIS_DELAY_MS} ms)… clap, snap, or play music nearby`;

      state.analysisTimer = setInterval(() => window.RG.Analysis.analyzeStep(state), window.RG.Const.ANALYSIS_HOP_MS);
      state.raf = requestAnimationFrame(ts => tick(state, ts));
    }
  }

  function endGame(state, opts = {}) {
    const showResults = opts.showResults !== false;

    state.running = false;
    state.ended = true;
    cancelAnimationFrame(state.raf);
    clearInterval(state.analysisTimer);
    window.RG.UI.comboMiss(state);

    if (state.mode === 'file' || state.mode === 'chart') {
      try { audioEl.pause(); } catch {}
      try { audioEl.currentTime = 0; } catch {}
      if (state.fileUrl) {
        try { URL.revokeObjectURL(state.fileUrl); } catch {}
        state.fileUrl = null;
      }
      if (state.mediaNode) {
        try { state.mediaNode.disconnect(); } catch {}
      }
      statusEl.textContent = 'Stopped — press Space to start (file/chart mode or mic if no file)';
      // Show results after finishing a song (file/chart modes) unless suppressed
      if (showResults && window.RG.UI && window.RG.UI.showResults) {
        window.RG.UI.showResults(state);
      }
    } else {
      if (state.micStream) {
        state.micStream.getTracks().forEach(t => t.stop());
      }
      statusEl.textContent = 'Stopped — press Space to start live mode again';
    }

    if (state.audioCtx) {
      state.audioCtx.suspend().catch(()=>{});
    }
  }

  function tick(state, ts) {
    if (!state.running) return;
    if (window.RG.Grid && window.RG.Grid.update) window.RG.Grid.update(state, ts);
    window.RG.Notes.updateNotes(state, ts);
    state.lastTs = ts;
    state.raf = requestAnimationFrame(t => tick(state, t));
  }

  window.RG.Game = { startGame, startChartPlayback, endGame, tick, resetForNewRun };
})();