(() => {
  const root = document.querySelector('.game');
  const { fullscreenBtn } = window.RG.Dom;

  function applyClass(active) {
    if (!root) return;
    if (active) root.classList.add('fullscreen');
    else root.classList.remove('fullscreen');
    if (fullscreenBtn) fullscreenBtn.textContent = active ? 'Exit Fullscreen' : 'Fullscreen';
  }

  async function enter() {
    if (!root) return;
    try {
      if (root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' });
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      }
    } catch (e) {
      // Fallback: still apply layout class even if FS API fails
    } finally {
      applyClass(true);
    }
  }

  async function exit() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
      }
    } catch (e) {
      // ignore
    } finally {
      applyClass(false);
    }
  }

  function toggle() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (active) exit();
    else enter();
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggle);
  }

  document.addEventListener('fullscreenchange', () => {
    const active = !!document.fullscreenElement;
    applyClass(active);
  });
  document.addEventListener('webkitfullscreenchange', () => {
    const active = !!document.webkitFullscreenElement;
    applyClass(active);
  });

  window.RG.Fullscreen = { enter, exit, toggle };
})();