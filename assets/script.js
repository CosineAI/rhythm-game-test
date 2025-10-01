(() => {
  const ANALYSIS_DELAY_MS = 2000; // ms lookahead before scheduling visible notes
  const FFT_SIZE = 2048;          // analyser FFT size
  const ANALYSIS_HOP_MS = 20;     // how often we analyze (approx)
  const MIN_ONSET_INTERVAL_MS = 120; // refractory period for onsets
  const THRESH_WINDOW = 30;       // flux history window size (samples)
  const THRESH_K = 1.5;           // threshold multiplier

  const KEY_ORDER = ['z','s','x','d','c'];
  const KEY_TO_LANE = { z: 0, s: 1, x: 2, d: 3, c: 4 };
  const LANE_TYPES = ['white', 'black', 'white', 'black', 'white'];

  const NOTE_H = 24;          // px
  const SPEED = 420;          // px/s
  const PERFECT_DIST = 12;    // px to hit-line
  const GOOD_DIST = 30;
  const OKAY_DIST = 56;
  const KEYCAPS_H = 140;      // must match CSS --keycaps-h

  const playfield = document.getElementById('playfield');
  const judgementEl = document.getElementById('judgement');
  const statusEl = document.getElementById('status');
  const lanes = Array.from(document.querySelectorAll('.lane'));
  const keycapNodes = new Map(KEY_ORDER.map(k => [k, document.querySelector(`.keycap[data-key="${k}"]`)]));
  const fileInput = document.getElementById('audioFile');
  const audioEl = document.getElementById('audioPlayer');

  let state = resetState();

  function resetState() {
    return {
      running: false,
      ended: false,
      startAt: 0,
      lastTs: 0,
      hitY: 0,
      nextSpawnIdx: 0,
      schedule: [], // { t: msFromStart, lane }
      notes: [],    // { lane, el, spawnAt, y, judged }
      counts: { perfect: 0, good: 0, okay: 0, miss: 0 },
      raf: 0,

      // Mode and audio graph
      mode: 'live',       // 'live' | 'file'
      audioCtx: null,
      analyser: null,
      micStream: null,
      source: null,       // MediaStream source (mic)
      mediaNode: null,    // MediaElementAudioSourceNode (file)
      fileUrl: null,      // blob URL for uploaded file
      audioBaseTime: 0,   // AudioContext.currentTime when game starts (aligns with performance.now)
      analysisTimer: 0,
      prevAmp: null,
      fluxBuf: [],
      lastFlux: 0,
      lastOnsetTimeSec: -1e9,
      prevLane: -1,
      scratchFreq: null
    };
  }

  function measure() {
    const pfRect = playfield.getBoundingClientRect();
    state.hitY = pfRect.height - KEYCAPS_H - 12;
  }

  function clearNotes() {
    state.notes.forEach(n => n.el && n.el.remove());
    state.notes.length = 0;
  }

  async function setupLiveAudio() {
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

  async function setupFileAudio(file) {
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

  async function startGame() {
    if (state.running) return;

    clearNotes();
    state = Object.assign(resetState(), {});
    measure();

    const file = fileInput && fileInput.files && fileInput.files[0];

    if (file) {
      state.mode = 'file';
      try {
        await setupFileAudio(file);
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
      statusEl.textContent = `File mode: ${file.name} (delay ${ANALYSIS_DELAY_MS} ms)`;

      const onEnded = () => endGame();
      audioEl.addEventListener('ended', onEnded, { once: true });

      state.analysisTimer = setInterval(analyzeStep, ANALYSIS_HOP_MS);
      state.raf = requestAnimationFrame(tick);
    } else {
      state.mode = 'live';
      try {
        await setupLiveAudio();
      } catch (err) {
        console.error('Microphone error:', err);
        statusEl.textContent = 'Mic blocked/unavailable. Live mode requires microphone access.';
        return;
      }

      state.startAt = performance.now();
      state.audioBaseTime = state.audioCtx.currentTime;

      state.running = true;
      state.ended = false;
      statusEl.textContent = `Live mode: listening (delay ${ANALYSIS_DELAY_MS} ms)… clap, snap, or play music nearby`;

      state.analysisTimer = setInterval(analyzeStep, ANALYSIS_HOP_MS);
      state.raf = requestAnimationFrame(tick);
    }
  }

  function endGame() {
    state.running = false;
    state.ended = true;
    cancelAnimationFrame(state.raf);
    clearInterval(state.analysisTimer);

    if (state.mode === 'file') {
      try { audioEl.pause(); } catch {}
      try { audioEl.currentTime = 0; } catch {}
      if (state.fileUrl) {
        try { URL.revokeObjectURL(state.fileUrl); } catch {}
        state.fileUrl = null;
      }
      if (state.mediaNode) {
        try { state.mediaNode.disconnect(); } catch {}
      }
      statusEl.textContent = 'Stopped — press Space to start (file mode or mic if no file)';
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

  function analyzeStep() {
    if (!state.running || !state.analyser) return;

    const N = state.analyser.frequencyBinCount;
    const freqDb = state.scratchFreq;
    state.analyser.getFloatFrequencyData(freqDb);

    // Convert dB to linear amplitude
    const amp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const db = Math.max(-120, freqDb[i]);
      amp[i] = Math.pow(10, db / 20);
    }

    // Spectral flux
    let flux = 0;
    if (state.prevAmp) {
      for (let i = 0; i < N; i++) {
        const d = amp[i] - state.prevAmp[i];
        if (d > 0) flux += d;
      }
    }
    state.prevAmp = amp;

    const tSec = state.audioCtx.currentTime;
    state.fluxBuf.push(flux);
    if (state.fluxBuf.length > THRESH_WINDOW) state.fluxBuf.shift();

    const mean = state.fluxBuf.reduce((a,b)=>a+b,0) / state.fluxBuf.length;
    let variance = 0;
    for (let i = 0; i < state.fluxBuf.length; i++) {
      const d = state.fluxBuf[i] - mean;
      variance += d*d;
    }
    const std = Math.sqrt(variance / Math.max(1, state.fluxBuf.length - 1));
    const threshold = mean + THRESH_K * std;

    // Peak pick: rising over threshold with a small refractory period
    const isPeak = flux > threshold &&
                   flux > state.lastFlux &&
                   (tSec - state.lastOnsetTimeSec) * 1000 >= MIN_ONSET_INTERVAL_MS;

    if (isPeak) {
      state.lastOnsetTimeSec = tSec;
      const lane = assignLane(amp);
      scheduleNoteFromOnset(tSec, lane);
    }

    state.lastFlux = flux;
  }

  function assignLane(amp) {
    // Map spectral centroid to lane (0..4)
    const N = amp.length;
    const nyquist = state.audioCtx ? state.audioCtx.sampleRate / 2 : 22050;
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) {
      const f = (i / (N - 1)) * nyquist;
      const a = amp[i];
      num += f * a;
      den += a;
    }
    let norm = 0.5;
    if (den > 1e-9) {
      const centroid = num / den;
      norm = Math.min(1, Math.max(0, centroid / nyquist));
    }
    let lane = Math.min(4, Math.max(0, Math.floor(norm * 5)));
    if (lane === state.prevLane) lane = (lane + 1) % 5; // avoid repeated jacks
    state.prevLane = lane;
    return lane;
  }

  function scheduleNoteFromOnset(onsetTimeSec, lane) {
    const travelDist = Math.max(0, state.hitY - (NOTE_H / 2));
    const travelTimeMs = (travelDist / SPEED) * 1000;
    const hitPerfMs = state.startAt + ((onsetTimeSec - state.audioBaseTime) * 1000) + ANALYSIS_DELAY_MS;
    const spawnRelMs = hitPerfMs - travelTimeMs - state.startAt;

    const def = { t: spawnRelMs, lane };
    state.schedule.push(def);
    state.schedule.sort((a, b) => a.t - b.t);
  }

  function spawnNote(def) {
    const laneEl = lanes[def.lane];
    const el = document.createElement('div');
    el.className = `note ${LANE_TYPES[def.lane]}`;
    el.style.top = '0px';
    laneEl.appendChild(el);
    state.notes.push({
      lane: def.lane,
      el,
      spawnAt: state.startAt + def.t,
      y: 0,
      judged: false
    });
  }

  function updateNotes(ts) {
    const elapsed = ts - state.startAt;

    // Spawn due notes
    while (state.nextSpawnIdx < state.schedule.length && elapsed >= state.schedule[state.nextSpawnIdx].t) {
      spawnNote(state.schedule[state.nextSpawnIdx++]);
    }

    for (const n of state.notes) {
      if (!n.el) continue;
      const sinceSpawn = (ts - n.spawnAt) / 1000;
      if (sinceSpawn < 0) continue;
      n.y = sinceSpawn * SPEED;
      n.el.style.transform = `translateY(${n.y}px)`;

      const center = n.y + (NOTE_H / 2);
      if (!n.judged && center > state.hitY + OKAY_DIST) {
        n.judged = true;
        flash('Miss', 'miss');
        state.counts.miss++;
        n.el.classList.add('miss');
        setTimeout(() => n.el && n.el.remove(), 260);
      }
    }
  }

  function pickCandidate(lane) {
    let best = null;
    let bestDist = Infinity;
    for (const n of state.notes) {
      if (n.lane !== lane || n.judged || !n.el) continue;
      const center = n.y + (NOTE_H / 2);
      const dist = Math.abs(center - state.hitY);
      if (dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }
    return { note: best, dist: bestDist };
  }

  function judge(dist) {
    if (dist <= PERFECT_DIST) return 'perfect';
    if (dist <= GOOD_DIST) return 'good';
    if (dist <= OKAY_DIST) return 'okay';
    return null;
  }

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

  function hitLane(lane) {
    if (!state.running) return;
    const { note, dist } = pickCandidate(lane);
    const j = note ? judge(dist) : null;

    if (note) {
      if (j) {
        note.judged = true;
        note.el.classList.add('hit');
        setTimeout(() => note.el && note.el.remove(), 180);
        state.counts[j]++;
        flash(capitalize(j), j);
        triggerGlow(lane);
        screenShake();
      } else {
        // There is a note in this column, but timing was outside windows -> Miss
        flash('Miss', 'miss');
        state.counts.miss++;
      }
    } else {
      // No notes in this column -> no penalty and no Miss flash
    }
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function tick(ts) {
    if (!state.running) return;
    updateNotes(ts);
    state.lastTs = ts;
    state.raf = requestAnimationFrame(tick);
  }

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!state.running) startGame();
      else endGame();
      return;
    }
    if (KEY_TO_LANE[key] !== undefined) {
      if (!e.repeat) {
        const cap = keycapNodes.get(key);
        if (cap) cap.classList.add('active');
        hitLane(KEY_TO_LANE[key]);
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (KEY_TO_LANE[key] !== undefined) {
      const cap = keycapNodes.get(key);
      if (cap) cap.classList.remove('active');
    }
  });

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) {
        statusEl.textContent = `Selected: ${f.name} — press Space to start (or clear to use mic)`;
      }
    });
  }

  window.addEventListener('resize', measure);
})();