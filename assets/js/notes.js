(() => {
  const { lanes } = window.RG.Dom;
  const { LANE_TYPES, NOTE_H, SPEED, OKAY_DIST } = window.RG.Const;

  function spawnNote(state, def) {
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

  function updateNotes(state, ts) {
    const elapsed = ts - state.startAt;

    // Spawn due notes
    while (state.nextSpawnIdx < state.schedule.length && elapsed >= state.schedule[state.nextSpawnIdx].t) {
      spawnNote(state, state.schedule[state.nextSpawnIdx++]);
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
        window.RG.UI.flash('Miss', 'miss');
        state.counts.miss++;
        window.RG.UI.comboMiss(state);
        n.el.classList.add('miss');
        setTimeout(() => n.el && n.el.remove(), 260);
      }
    }
  }

  function pickCandidate(state, lane) {
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
    const { PERFECT_DIST, GOOD_DIST, OKAY_DIST } = window.RG.Const;
    if (dist <= PERFECT_DIST) return 'perfect';
    if (dist <= GOOD_DIST) return 'good';
    if (dist <= OKAY_DIST) return 'okay';
    return null;
  }

  window.RG.Notes = { spawnNote, updateNotes, pickCandidate, judge };
})();