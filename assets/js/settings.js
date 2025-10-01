(() => {
  const STORAGE_KEY = 'rg_settings_v1';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { inputOffsetMs: 0, difficulty: 'normal' };
      const obj = JSON.parse(raw);
      return {
        inputOffsetMs: typeof obj.inputOffsetMs === 'number' ? obj.inputOffsetMs : 0,
        difficulty: (obj.difficulty === 'veryeasy' || obj.difficulty === 'easy' || obj.difficulty === 'hard') ? obj.difficulty : 'normal'
      };
    } catch {
      return { inputOffsetMs: 0, difficulty: 'normal' };
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

  function openModal() {
    const { settingsModal, settingsDifficulty, inputLagRange, inputLagNumber, difficultySelect } = window.RG.Dom;
    if (!settingsModal) return;
    // Prefill from current cache / controls
    const currentDiff = (difficultySelect && difficultySelect.value) || getDifficulty();
    if (settingsDifficulty) settingsDifficulty.value = currentDiff;
    const off = getInputOffsetMs();
    if (inputLagRange) inputLagRange.value = String(off);
    if (inputLagNumber) inputLagNumber.value = String(off);

    settingsModal.classList.remove('hidden');
    settingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const { settingsModal } = window.RG.Dom;
    if (!settingsModal) return;
    settingsModal.classList.add('hidden');
    settingsModal.setAttribute('aria-hidden', 'true');
  }

  function init() {
    const {
      openSettingsBtn,
      settingsModal,
      settingsDifficulty,
      inputLagRange,
      inputLagNumber,
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

    // Sync range and number
    function sync(val) {
      if (inputLagRange) inputLagRange.value = String(val);
      if (inputLagNumber) inputLagNumber.value = String(val);
    }
    if (inputLagRange) inputLagRange.addEventListener('input', () => sync(inputLagRange.value));
    if (inputLagNumber) inputLagNumber.addEventListener('input', () => sync(inputLagNumber.value));

    // Save
    if (settingsSave) settingsSave.addEventListener('click', () => {
      const diff = settingsDifficulty ? settingsDifficulty.value : 'normal';
      const off = inputLagNumber ? Number(inputLagNumber.value) : 0;

      setDifficulty(diff);
      setInputOffsetMs(off);

      if (difficultySelect) {
        difficultySelect.value = diff;
        const ev = new Event('change', { bubbles: true });
        difficultySelect.dispatchEvent(ev);
      }

      if (statusEl) {
        const f = window.RG.Dom.fileInput && window.RG.Dom.fileInput.files && window.RG.Dom.fileInput.files[0];
        const diffName = window.RG.Difficulty.getDifficultyParams().name;
        const offText = getInputOffsetMs();
        if (f) {
          statusEl.textContent = `Selected: ${f.name} — Difficulty: ${diffName}. Input offset ${offText} ms.`;
        } else {
          statusEl.textContent = `Ready — Difficulty: ${diffName}. Input offset ${offText} ms.`;
        }
      }

      closeModal();
    });

    // Apply persisted offset immediately (no UI effect besides scheduling)
    // Nothing else to do here; users feel it during play.
  }

  window.RG.Settings = {
    init,
    openModal,
    closeModal,
    getInputOffsetMs,
    setInputOffsetMs,
    getDifficulty,
    setDifficulty
  };
})();