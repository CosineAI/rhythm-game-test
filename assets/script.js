(() => {
  const KEY_ORDER = ['z','s','x','d','c'];
  const KEY_TO_LANE = { z: 0, s: 1, x: 2, d: 3, c: 4 };
  const LANE_TYPES = ['white', 'black', 'white', 'black', 'white'];

  const NOTE_H = 24;          // px
  const SPEED = 420;          // px/s
  const PERFECT_DIST = 12;    // px to hit-line
  const GOOD_DIST = 30;
  const OKAY_DIST = 56;
  const KEYCAPS_H = 140;      // must match CSS --keycaps-h

  const TOTAL_NOTES = 10;
  const GAP_MS = 600;

  const playfield = document.getElementById('playfield');
  const judgementEl = document.getElementById('judgement');
  const statusEl = document.getElementById('status');
  const lanes = Array.from(document.querySelectorAll('.lane'));
  const keycapNodes = new Map(KEY_ORDER.map(k => [k, document.querySelector(`.keycap[data-key="${k}"]`)]));

  let state = resetState();

  function resetState() {
    return {
      running: false,
      ended: false,
      startAt: 0,
      lastTs: 0,
      hitY: 0,
      nextSpawnIdx: 0,
      schedule: [],
      notes: [], // { lane, el, spawnAt, y, judged }
      counts: { perfect: 0, good: 0, okay: 0, miss: 0 },
      raf: 0
    };
  }

  function measure() {
    const pfRect = playfield.getBoundingClientRect();
    state.hitY = pfRect.height - KEYCAPS_H - 12;
  }

  function makeSchedule(count) {
    const schedule = [];
    let t = 700;
    for (let i = 0; i < count; i++) {
      const lane = Math.floor(Math.random() * 5);
      const jitter = (Math.random() * 180) - 90;
      schedule.push({ t: t + jitter, lane });
      t += GAP_MS;
    }
    return schedule;
  }

  function clearNotes() {
    state.notes.forEach(n => n.el && n.el.remove());
    state.notes.length = 0;
  }

  function startGame() {
    clearNotes();
    state = resetState();
    measure();
    state.schedule = makeSchedule(TOTAL_NOTES);
    state.startAt = performance.now();
    state.lastTs = state.startAt;
    state.running = true;
    statusEl.textContent = 'Game on — hit the notes!';
    state.raf = requestAnimationFrame(tick);
  }

  function endGame() {
    state.running = false;
    state.ended = true;
    statusEl.textContent = 'Finished — press Space to restart';
    cancelAnimationFrame(state.raf);
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

  function hitLane(lane) {
    if (!state.running) return;
    const { note, dist } = pickCandidate(lane);
    const j = note ? judge(dist) : null;

    if (note && j) {
      note.judged = true;
      note.el.classList.add('hit');
      setTimeout(() => note.el && note.el.remove(), 180);
      state.counts[j]++;
      flash(capitalize(j), j);
      // Send a green glow up the lane for any hit that's at least Okay
      triggerGlow(lane);
    } else {
      flash('Miss', 'miss');
      state.counts.miss++;
    }

    const judged = state.counts.perfect + state.counts.good + state.counts.okay + state.counts.miss;
    if (judged >= state.schedule.length) {
      endGame();
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

  window.addEventListener('resize', measure);
})();