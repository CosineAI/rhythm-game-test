(() => {
  const { FFT_SIZE } = window.RG.Const;
  const { statusEl, audioEl } = window.RG.Dom;

  async function ensureCtx(state) {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      await state.audioCtx.resume();
    }
    if (!state.analyser) {
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = FFT_SIZE;
      state.analyser.smoothingTimeConstant = 0.0;
      state.analyser.minDecibels = -100;
      state.analyser.maxDecibels = -10;
      state.scratchFreq = new Float32Array(state.analyser.frequencyBinCount);
      state.prevAmp = new Float32Array(state.analyser.frequencyBinCount);
    }
  }

  async function setupLiveAudio(state) {
    await ensureCtx(state);

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
    state.playbackDelayMs = 0;
  }

  async function setupFileAudio(state, file) {
    await ensureCtx(state);

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

    state.playbackDelayMs = 0;
  }

  async function setupYouTubeAudio(state) {
    await ensureCtx(state);

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
    state.playbackDelayMs = 0; // using visual-only lag in youtube mode
  }

  async function setupCapturedTabWithDelay(state, delaySec) {
    await ensureCtx(state);

    // Cleanup any previous graph
    if (state.source) {
      try { state.source.disconnect(); } catch {}
      state.source = null;
    }
    if (state.mediaNode) {
      try { state.mediaNode.disconnect(); } catch {}
    }
    if (state.captureStream) {
      try { state.captureStream.getTracks().forEach(t => t.stop()); } catch {}
      state.captureStream = null;
    }
    if (state.delayNode) {
      try { state.delayNode.disconnect(); } catch {}
      state.delayNode = null;
    }

    const dSec = Math.max(0, Math.min(10, Number(delaySec) || 0));
    if (statusEl) statusEl.textContent = 'Select the YouTube tab or window, enable audio sharing. Local playback of that tab may be muted by the browser.';

    // Capture ANY tab/window/screen (user selects the YouTube tab)
    const constraints = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Some Chromium versions support suppressing local playback of the captured tab
        // This is non-standard; wrap in try/catch via applyConstraints if needed later.
        // suppressLocalAudioPlayback: true
      }
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

    // Try to suppress local playback of the captured tab if the browser supports it
    try {
      const aTracks = stream.getAudioTracks();
      await Promise.all(aTracks.map(t => t.applyConstraints ? t.applyConstraints({ suppressLocalAudioPlayback: true }) : null));
    } catch {}

    // Source -> Delay -> [Analyser, Destination]
    const source = state.audioCtx.createMediaStreamSource(stream);

    const maxDelay = 12.0;
    const delay = state.audioCtx.createDelay(maxDelay);
    delay.delayTime.value = dSec;

    source.connect(delay);
    delay.connect(state.analyser);
    delay.connect(state.audioCtx.destination);

    state.source = source;
    state.captureStream = stream;
    state.delayNode = delay;

    // Since analyser sees the delayed audio, we don't need extra visual delay beyond user offset.
    state.playbackDelayMs = Math.max(0, 0);
  }

  window.RG.Audio = { setupLiveAudio, setupFileAudio, setupYouTubeAudio, setupCapturedTabWithDelay };
})();