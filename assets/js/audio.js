(() => {
  const { FFT_SIZE } = window.RG.Const;
  const { statusEl, audioEl } = window.RG.Dom;

  async function setupLiveAudio(state) {
    // Ensure single persistent AudioContext
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    // Build analyser once
    if (!state.analyser) {
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = FFT_SIZE;
      state.analyser.smoothingTimeConstant = 0.0;
      state.analyser.minDecibels = -100;
      state.analyser.maxDecibels = -10;
      state.scratchFreq = new Float32Array(state.analyser.frequencyBinCount);
      state.prevAmp = new Float32Array(state.analyser.frequencyBinCount);
    }

    // Disconnect media node if previously connected
    if (state.mediaNode) {
      try { state.mediaNode.disconnect(); } catch {}
    }

    statusEl.textContent = 'Requesting microphone…';
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const source = state.audioCtx.createMediaStreamSource(stream);
    source.connect(state.analyser);

    state.source = source;
    state.micStream = stream;
  }

  async function setupFileAudio(state, file) {
    // Ensure single persistent AudioContext
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    // Build analyser once (even if not used during precomputed playback, harmless)
    if (!state.analyser) {
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = FFT_SIZE;
      state.analyser.smoothingTimeConstant = 0.0;
      state.analyser.minDecibels = -100;
      state.analyser.maxDecibels = -10;
      state.scratchFreq = new Float32Array(state.analyser.frequencyBinCount);
      state.prevAmp = new Float32Array(state.analyser.frequencyBinCount);
    }

    // Disconnect mic source if previously connected
    if (state.source) {
      try { state.source.disconnect(); } catch {}
      state.source = null;
    }

    // Wire up media element to analyser and destination
    if (!state.mediaNode) {
      state.mediaNode = state.audioCtx.createMediaElementSource(audioEl);
    } else {
      try { state.mediaNode.disconnect(); } catch {}
    }
    state.mediaNode.connect(state.analyser);
    state.mediaNode.connect(state.audioCtx.destination);

    // Load file into <audio>
    if (state.fileUrl) {
      try { URL.revokeObjectURL(state.fileUrl); } catch {}
      state.fileUrl = null;
    }
    const url = URL.createObjectURL(file);
    state.fileUrl = url;
    audioEl.src = url;
    audioEl.loop = false;
    audioEl.currentTime = 0;

    // Wait for metadata so duration and decoding are ready
    await new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onErr = (e) => { cleanup(); reject(e); };
      const cleanup = () => {
        audioEl.removeEventListener('loadedmetadata', onReady);
        audioEl.removeEventListener('error', onErr);
      };
      audioEl.addEventListener('loadedmetadata', onReady, { once: true });
      audioEl.addEventListener('error', onErr, { once: true });
      // In case metadata already loaded
      if (audioEl.readyState >= 1) {
        cleanup();
        resolve();
      }
    });
  }

  async function setupYouTubeAudio(state) {
    // Ensure single persistent AudioContext
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }

    // Build analyser once
    if (!state.analyser) {
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = FFT_SIZE;
      state.analyser.smoothingTimeConstant = 0.0;
      state.analyser.minDecibels = -100;
      state.analyser.maxDecibels = -10;
      state.scratchFreq = new Float32Array(state.analyser.frequencyBinCount);
      state.prevAmp = new Float32Array(state.analyser.frequencyBinCount);
    }

    // Disconnect previous sources (mic/file)
    if (state.source) {
      try { state.source.disconnect(); } catch {}
      state.source = null;
    }
    if (state.mediaNode) {
      try { state.mediaNode.disconnect(); } catch {}
    }
    // Stop any previous capture
    if (state.captureStream) {
      try { state.captureStream.getTracks().forEach(t => t.stop()); } catch {}
      state.captureStream = null;
    }

    // Ask user to share THIS TAB with audio; user must choose "This tab" and enable "Share tab audio"
    if (statusEl) statusEl.textContent = 'Choose “This Tab” and enable “Share tab audio” in the prompt…';
    const constraints = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

    // Hook captured tab audio into analyser
    const source = state.audioCtx.createMediaStreamSource(stream);
    source.connect(state.analyser);

    state.source = source;
    state.captureStream = stream;
  }

  window.RG.Audio = { setupLiveAudio, setupFileAudio, setupYouTubeAudio };
})();