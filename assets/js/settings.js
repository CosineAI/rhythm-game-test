(() => {
  const STORAGE_KEY = 'rg_settings_v1';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { inputOffsetMs: 0, difficulty: 'normal', chartPadMs: 3000, keyBindings: ['z','s','x','d','c'], fallSpeedMult: 1.0, gridlinesEnabled: false };
      const obj = JSON.parse(raw);
      const kb = Array.isArray(obj.keyBindings) && obj.keyBindings.length === 5 ? obj.keyBindings : ['z','s','x','d','c'];
      return {
        inputOffsetMs: typeof obj.inputOffsetMs === 'number' ? obj.inputOffsetMs : 0,
        difficulty: (obj.difficulty === 'veryeasy' || obj.difficulty === 'easy' || obj.difficulty === 'hard') ? obj.difficulty : 'normal',
        chartPadMs: typeof obj.chartPadMs === 'number' ? obj.chartPadMs : 3000,
        keyBindings: kb.map(k => String(k || '').toLowerCase().slice(0,1)),
        fallSpeedMult: (typeof obj.fallSpeedMult === 'number' && obj.fallSpeedMult > 0) ? obj.fallSpeedMult : 1.0,
        gridlinesEnabled: !!obj.gridlinesEnabled
      };
    } catch {
      return { inputOffsetMs: 0, difficulty: 'normal', chartPadMs: 3000, keyBindings: ['z','s','x','d','c'], fallSpeedMult: 1.0, gridlinesEnabled: false };
    }
  }

  function save(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
  }

  let cache = load();

  function getInputOffsetMs() {
    return cache.inputOffsetMs || 0;
  }

  function setInputOffsetMs(v) {
    cache.inputOffsetMs = Math.max(-300, Math.min(300, Math.round(v)));
    save(cache);
  }

  function getDifficulty() {
    return cache.difficulty || 'normal';
  }

  function setDifficulty(d) {
    const allowed = ['veryeasy','easy','normal','hard'];
    cache.difficulty = allowed.includes(d) ? d : 'normal';
    save(cache);
  }

  function getChartPadMs() {
    const v = cache.chartPadMs;
    return (typeof v === 'number' && v >= 0) ? v : 3000;
  }

  function setChartPadMs(v) {
    const n = Math.max(0, Math.min(10000, Math.round(Number(v))));
    cache.chartPadMs = n;
    save(cache);
  }

  function getKeyBindings() {
    const kb = cache.keyBindings || ['z','s','x','d','c'];
    // Ensure length 5
    const out = kb.slice(0,5);
    while (out.length < 5) out.push('');
    return out;
  }

  function setKeyBindings(arr) {
    if (!Array.isArray(arr) || arr.length !== 5) return;
    const cleaned = arr.map(k => String(k || '').toLowerCase().slice(0,1));
    // Validate unique, non-empty, non-space
    const set = new Set();
    for (const k of cleaned) {
      if (!k || /\s/.test(k)) return; // invalid
      set.add(k);
    }
    if (set.size !== cleaned.length) return; // duplicates
    cache.keyBindings = cleaned;
    save(cache);
  }

  function getKeyToLane() {
    const map = {};
    const binds = getKeyBindings();
    for (let i = 0; i < binds.length; i++) {
      map[binds[i]] = i;
    }
    return map;
  }

  function getFallSpeedMult() {
    const m = cache.fallSpeedMult;
    return (typeof m === 'number' && m > 0) ? m : 1.0;
  }

  function setFallSpeedMult(v) {
    let n = Number(v);
    if (!isFinite(n) || n <= 0) n = 1.0;
    n = Math.max(0.5, Math.min(2.0, n));
    cache.fallSpeedMult = n;
    save(cache);
  }

  function getGridlinesEnabled() {
    return !!cache.gridlinesEnabled;
  }

  function setGridlinesEnabled(v) {
    cache.gridlinesEnabled = !!v;
    save(cache);
  }

  function openModal() {
    const {
      settingsModal,
      settingsDifficulty,
      inputLagRange,
      inputLagNumber,
      chartPadRange,
      chartPadNumber,
      keyBind0, keyBind1, keyBind2, keyBind3, keyBind4,
      fallSpeedRange, fallSpeedNumber,
      showGridlines,
      difficultySelect
    } = window.RG.Dom;
    if (!settingsModal) return;

    // If not doing the slide-with-setup choreography, ensure it's centered
    const panel = settingsModal.querySelector('.modal-panel');
    if (!window.RG.Settings._slideWithSetup) {
      settingsModal.classList.remove('slide-stacked');
      if (panel) {
        panel.classList.remove('slide-in-right', 'slide-out-right');
      }
    }

    // Prefill from current cache / controls
    const currentDiff = (difficultySelect && difficultySelect.value) || getDifficulty();
    if (settingsDifficulty) settingsDifficulty.value = currentDiff;
    const off = getInputOffsetMs();
    if (inputLagRange) inputLagRange.value = String(off);
    if (inputLagNumber) inputLagNumber.value = String(off);

    const pad = getChartPadMs();
    if (chartPadRange) chartPadRange.value = String(pad);
    if (chartPadNumber) chartPadNumber.value = String(pad);

    const binds = getKeyBindings();
    if (keyBind0) keyBind0.value = String(binds[0] || '').toUpperCase();
    if (keyBind1) keyBind1.value = String(binds[1] || '').toUpperCase();
    if (keyBind2) keyBind2.value = String(binds[2] || '').toUpperCase();
    if (keyBind3) keyBind3.value = String(binds[3] || '').toUpperCase();
    if (keyBind4) keyBind4.value = String(binds[4] || '').toUpperCase();

    const mult = getFallSpeedMult();
    if (fallSpeedRange) fallSpeedRange.value = String(mult);
    if (fallSpeedNumber) fallSpeedNumber.value = String(mult);

    if (showGridlines) showGridlines.checked = getGridlinesEnabled();

    settingsModal.classList.remove('hidden');
    settingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const { settingsModal } = window.RG.Dom;
    if (!settingsModal) return;

    // If invoked via setup modal slide transition, animate out then hide
    if (window.RG.Settings && window.RG.Settings._slideWithSetup) {
      const settingsPanel = settingsModal.querySelector('.modal-panel');
      const setupModal = document.getElementById('setupModal');
      const setupPanel = setupModal ? setupModal.querySelector('.modal-panel.setup') : null;

      if (settingsPanel && setupPanel) {
        // Reverse animation: settings out right, setup back in
        settingsPanel.classList.remove('slide-in-right');
        settingsPanel.classList.add('slide-out-right');
        setupPanel.classList.remove('slide-out-left');
        // force reflow to ensure transition
        void setupPanel.offsetWidth;
        setupPanel.classList.add('slide-in-left');

        const onDone = () => {
          settingsPanel.removeEventListener('transitionend', onDone);
          settingsModal.classList.add('hidden');
          settingsModal.setAttribute('aria-hidden', 'true');
          settingsModal.classList.remove('slide-stacked');
          settingsPanel.classList.remove('slide-out-right');
          setupPanel.classList.remove('slide-in-left');
          // clear flag
          window.RG.Settings._slideWithSetup = false;
        };
        settingsPanel.addEventListener('transitionend', onDone);
        return;
      }
    }

    // Default immediate close
    settingsModal.classList.add('hidden');
    settingsModal.setAttribute('aria-hidden', 'true');
    // Ensure stale slide classes aren't retained so future opens are centered
    settingsModal.classList.remove('slide-stacked');
    const panel = settingsModal.querySelector('.modal-panel');
    if (panel) {
      panel.classList.remove('slide-in-right', 'slide-out-right');
    }
  }

  function init() {
    const {
      openSettingsBtn,
      settingsModal,
      settingsDifficulty,
      inputLagRange,
      inputLagNumber,
      chartPadRange,
      chartPadNumber,
      keyBind0, keyBind1, keyBind2, keyBind3, keyBind4,
      fallSpeedRange, fallSpeedNumber,
      showGridlines,
      settingsSave,
      settingsCancel,
      difficultySelect,
      statusEl
    } = window.RG.Dom;

    // Apply persisted difficulty to the visible control
    if (difficultySelect) {
      const d = getDifficulty();
      difficultySelect.value = d;
      // Trigger a layout update to match
      window.RG.UI.applyKeyLayout();
    }

    // On init, refresh keycap labels based on current bindings
    if (window.RG.UI && window.RG.UI.refreshKeycapLabels) {
      window.RG.UI.refreshKeycapLabels();
    }

    // Wire open/close
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', openModal);
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close')) {
          closeModal();
        }
      });
    }
    if (settingsCancel) settingsCancel.addEventListener('click', closeModal);

    // Sync range and number for input lag
    function syncLag(val) {
      if (inputLagRange) inputLagRange.value = String(val);
      if (inputLagNumber) inputLagNumber.value = String(val);
    }
    if (inputLagRange) inputLagRange.addEventListener('input', () => syncLag(inputLagRange.value));
    if (inputLagNumber) inputLagNumber.addEventListener('input', () => syncLag(inputLagNumber.value));

    // Sync range and number for chart pad
    function syncPad(val) {
      if (chartPadRange) chartPadRange.value = String(val);
      if (chartPadNumber) chartPadNumber.value = String(val);
    }
    if (chartPadRange) chartPadRange.addEventListener('input', () => syncPad(chartPadRange.value));
    if (chartPadNumber) chartPadNumber.addEventListener('input', () => syncPad(chartPadNumber.value));

    // Sync fall speed controls
    function syncFall(val) {
      if (fallSpeedRange) fallSpeedRange.value = String(val);
      if (fallSpeedNumber) fallSpeedNumber.value = String(val);
    }
    if (fallSpeedRange) fallSpeedRange.addEventListener('input', () => syncFall(fallSpeedRange.value));
    if (fallSpeedNumber) fallSpeedNumber.addEventListener('input', () => syncFall(fallSpeedNumber.value));

    // Force single-character uppercase in keybind inputs
    function normalizeKeyInput(el) {
      if (!el) return;
      el.addEventListener('input', () => {
        const v = (el.value || '').slice(0,1).toUpperCase();
        el.value = v;
      });
    }
    [keyBind0, keyBind1, keyBind2, keyBind3, keyBind4].forEach(normalizeKeyInput);

    // Save
    if (settingsSave) settingsSave.addEventListener('click', () => {
      const diff = settingsDifficulty ? settingsDifficulty.value : 'normal';
      const off = inputLagNumber ? Number(inputLagNumber.value) : 0;
      const pad = chartPadNumber ? Number(chartPadNumber.value) : 3000;

      const k0 = keyBind0 ? keyBind0.value.toLowerCase() : 'z';
      const k1 = keyBind1 ? keyBind1.value.toLowerCase() : 's';
      const k2 = keyBind2 ? keyBind2.value.toLowerCase() : 'x';
      const k3 = keyBind3 ? keyBind3.value.toLowerCase() : 'd';
      const k4 = keyBind4 ? keyBind4.value.toLowerCase() : 'c';
      const bindings = [k0,k1,k2,k3,k4];

      const fall = fallSpeedNumber ? Number(fallSpeedNumber.value) : 1.0;
      const grid = showGridlines ? !!showGridlines.checked : false;

      setDifficulty(diff);
      setInputOffsetMs(off);
      setChartPadMs(pad);
      setFallSpeedMult(fall);

      // Validate bindings (unique and non-empty)
      const uniq = new Set(bindings);
      const valid = !bindings.some(k => !k || /\s/.test(k)) && uniq.size === bindings.length;
      if (valid) {
        setKeyBindings(bindings);
        if (window.RG.UI && window.RG.UI.refreshKeycapLabels) window.RG.UI.refreshKeycapLabels();
      } else if (statusEl) {
        statusEl.textContent = 'Invalid key bindings: must be 5 unique, non-space characters.';
      }

      setGridlinesEnabled(grid);

      // Reflect difficulty to any legacy on-page select and apply lane layout now
      if (difficultySelect) {
        difficultySelect.value = diff;
        const ev = new Event('change', { bubbles: true });
        difficultySelect.dispatchEvent(ev);
      }
      if (window.RG.UI && window.RG.UI.applyKeyLayout) {
        window.RG.UI.applyKeyLayout();
      }

      if (statusEl) {
        const f = window.RG.Dom.fileInput && window.RG.Dom.fileInput.files && window.RG.Dom.fileInput.files[0];
        const diffName = window.RG.Difficulty.getDifficultyParams().name;
        const offText = getInputOffsetMs();
        const padText = getChartPadMs();
        const fallText = getFallSpeedMult().toFixed(2);
        const keyText = getKeyBindings().map(k => k.toUpperCase()).join(' ');
        if (f) {
          statusEl.textContent = `Selected: ${f.name} — Difficulty: ${diffName}. Offset ${offText}ms. Chart pad ${padText}ms. Fall ${fallText}x. Keys ${keyText}.`;
        } else {
          statusEl.textContent = `Ready — Difficulty: ${diffName}. Offset ${offText}ms. Chart pad ${padText}ms. Fall ${fallText}x. Keys ${keyText}.`;
        }
      }

      closeModal();
    });

    // Apply persisted settings immediately if needed
  }

  window.RG.Settings = {
    init,
    openModal,
    closeModal,
    getInputOffsetMs,
    setInputOffsetMs,
    getDifficulty,
    setDifficulty,
    getChartPadMs,
    setChartPadMs,
    getKeyBindings,
    setKeyBindings,
    getKeyToLane,
    getFallSpeedMult,
    setFallSpeedMult,
    getGridlinesEnabled,
    setGridlinesEnabled
  };
})();