(() => {
  const { KEYCAPS_H, SPEED } = window.RG.Const;
  const { gridlinesContainer } = window.RG.Dom;

  function spawnBeatLine(state, def) {
    if (!gridlinesContainer) return;
    const el = document.createElement('div');
    el.className = 'gridline' + (def.strong ? ' strong' : '');
    el.style.top = '0px';
    gridlinesContainer.appendChild(el);
    state.beatLines.push({
      el,
      spawnAt: state.startAt + def.t,
      y: 0
    });
  }

  function update(state, ts) {
    const elapsed = ts - state.startAt;

    // Spawn due beat lines
    while (state.nextBeatIdx < state.beatSchedule.length && elapsed >= state.beatSchedule[state.nextBeatIdx].t) {
      spawnBeatLine(state, state.beatSchedule[state.nextBeatIdx++]);
    }

    // Move and cleanup
    const mult = (window.RG.Settings && window.RG.Settings.getFallSpeedMult) ? window.RG.Settings.getFallSpeedMult() : 1.0;
    const effSpeed = SPEED * mult;
    const removeAfterY = state.hitY + KEYCAPS_H + 60;

    for (const b of state.beatLines) {
      if (!b.el) continue;
      const sinceSpawn = (ts - b.spawnAt) / 1000;
      if (sinceSpawn < 0) continue;
      b.y = sinceSpawn * effSpeed;
      b.el.style.transform = `translateY(${b.y}px)`;
      if (b.y > removeAfterY) {
        b.el.remove();
        b.el = null;
      }
    }

    // Compact array occasionally
    if (state.beatLines.length > 0 && state.beatLines[0] && state.beatLines[0].el === null) {
      state.beatLines = state.beatLines.filter(x => x && x.el);
    }
  }

  window.RG.Grid = { update };
})();