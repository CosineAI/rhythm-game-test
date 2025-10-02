(() => {
  const { statusEl, audioEl, playChartBtn, fileInput } = window.RG.Dom;
  const { measure, clearNotes } = window.RG.State;

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

  async function startYouTubeMode(state) {
    state.mode = 'youtube';

    // Ensure a loaded YouTube player exists
    if (!window.RG.YouTube || !window.RG.YouTube.isLoaded || !window.RG.YouTube.isLoaded()) {
      statusEl.textContent = 'Load a YouTube link first.';
      return;
    }

    try {
      await window.RG.Audio.setupYouTubeAudio(state);
    } catch (err) {
      console.error('Display capture error:', err);
      statusEl.textContent = 'Capture cancelled/unavailable. You must share “This Tab” with audio.';
      return;
    }

    try {
      await state.audioCtx.resume();
      window.RG.YouTube.play();
    } catch (err) {
      console.error('YouTube play error:', err);
      statusEl.textContent = 'Playback blocked. Click the page and press Space again.';
      return;
    }

    // Visual delay for non-buffered streaming (notes lag audio)
    state.analysisVisualDelayMs = window.RG.Const.ANALYSIS_DELAY_MS;

    state.startAt = performance.now();
    state.audioBaseTime = state.audioCtx.currentTime;
    state.running = true;
    state.ended = false;

    const title = (window.RG.YouTube.getTitle && window.RG.YouTube.getTitle()) || 'YouTube';
    statusEl.textContent = `YouTube mode: streaming “${title}” (visual delay ${window.RG.Const.ANALYSIS_DELAY_MS} ms). Press Space to stop.`;

    state.analysisTimer = setInterval(() => window.RG.Analysis.analyzeStep(state), window.RG.Const.ANALYSIS_HOP_MS);
    state.raf = requestAnimationFrame(ts => tick(state, ts));
  }

  async function startCaptureDelayMode(state, delaySec) {
    state.mode = 'capture-delay';

    try {
      await window.RG.Audio.setupCapturedTabWithDelay(state, delaySec);
    } catch (err) {
      console.error('Display capture error:', err);
      statusEl.textContent = 'Capture cancelled/unavailable. Choose a tab or window and enable audio sharing.';
      return;
    }

    try {
      await state.audioCtx.resume();
    } catch (err) {
      console.error('Playback error:', err);
      statusEl.textContent = 'Playback blocked. Click the page and try again.';
      return;
    }

    // Analyzer is fed delayed audio, so no extra visual delay is needed
    state.analysisVisualDelayMs = 0;

    state.startAt = performance.now();
    state.audioBaseTime = state.audioCtx.currentTime;
    state.running = true;
    state.ended = false;

    const d = Math.max(0, Number(delaySec) || 0);
    statusEl.textContent = `Tab capture (delayed): audio delayed ${d.toFixed(1)}s; notes aligned. Press Space to stop.`;

    state.analysisTimer = setInterval(() => window.RG.Analysis.analyzeStep(state), window.RG.Const.ANALYSIS_HOP_MS);
    state.raf = requestAnimationFrame(ts => tick(state, ts));
  }

  async function startGame(state) {
    if (state.running) return;

    // Preserve any precomputed chart across reset
    const prevChart = state.precomputedChart;

    clearNotes(state);
    window.RG.State.state = Object.assign(window.RG.State.resetState(), {});
    state = window.RG.State.state;
    state.precomputedChart = prevChart;
    measure(state);
    if (window.RG.Score && window.RG.Score.reset) window.RG.Score.reset(state);

    const file = fileInput && fileInput.files && fileInput.files[0];
    const hasChart = !!(file && state.precomputedChart && state.precomputedChart.fileName === file.name);

    if (hasChart && (state.preferChartOnStart || true)) {
      state.preferChartOnStart = false;
      await startChartPlayback(state, file);
      return;
    }

    // Prefer YouTube mode if a video is loaded
    if (window.RG.YouTube && window.RG.YouTube.isLoaded && window.RG.YouTube.isLoaded()) {
      await startYouTubeMode(state);
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

  function endGame(state) {
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
    } else if (state.mode === 'youtube') {
      try { window.RG.YouTube.pause(); } catch {}
      if (state.captureStream) {
        try { state.captureStream.getTracks().forEach(t => t.stop()); } catch {}
        state.captureStream = null;
      }
      if (state.source) {
        try { state.source.disconnect(); } catch {}
        state.source = null;
      }
      statusEl.textContent = 'Stopped — press Space to start YouTube again, or load a new link.';
    } else if (state.mode === 'capture-delay') {
      if (state.captureStream) {
        try { state.captureStream.getTracks().forEach(t => t.stop()); } catch {}
        state.captureStream = null;
      }
      if (state.delayNode) {
        try { state.delayNode.disconnect(); } catch {}
        state.delayNode = null;
      }
      if (state.source) {
        try { state.source.disconnect(); } catch {}
        state.source = null;
      }
      statusEl.textContent = 'Stopped — press Space or use Capture Tab to start again.';
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

  window.RG.Game = { startGame, startChartPlayback, endGame, tick, startCaptureDelayMode };
})();