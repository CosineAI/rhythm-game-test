(() => {
  const { youtubePlayerContainer, statusEl } = window.RG.Dom;

  let apiReadyResolve;
  const apiReadyPromise = new Promise((res) => { apiReadyResolve = res; });

  // Load IFrame API script once
  function ensureApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      tag.id = 'yt-iframe-api';
      document.head.appendChild(tag);
    }
    // YouTube IFrame API global callback
    if (!window.onYouTubeIframeAPIReady) {
      window.onYouTubeIframeAPIReady = () => {
        if (apiReadyResolve) apiReadyResolve();
      };
    }
    return apiReadyPromise;
  }

  function parseVideoId(url) {
    if (!url) return null;
    try {
      // If it's already an 11-char ID, accept it
      const simpleId = String(url).trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(simpleId)) return simpleId;

      const u = new URL(url);
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.slice(1);
        return id ? id : null;
      }
      if (u.hostname.includes('youtube.com')) {
        if (u.pathname === '/watch') {
          return u.searchParams.get('v');
        }
        if (u.pathname.startsWith('/embed/')) {
          return u.pathname.split('/embed/')[1].split(/[\?\&]/)[0];
        }
        if (u.pathname.startsWith('/shorts/')) {
          return u.pathname.split('/shorts/')[1].split(/[\?\&]/)[0];
        }
      }
    } catch {
      // not a URL, ignore
    }
    return null;
  }

  let player = null;
  let loadedVideoId = null;
  let ready = false;

  async function load(urlOrId) {
    const id = parseVideoId(urlOrId);
    if (!id) {
      if (statusEl) statusEl.textContent = 'Invalid YouTube link.';
      throw new Error('Invalid YouTube link');
    }

    await ensureApi();

    const state = window.RG.State.state;

    if (player) {
      try {
        player.cueVideoById(id);
        loadedVideoId = id;
        ready = true;
        if (statusEl) statusEl.textContent = 'YouTube video loaded. Press Space to start and share this tab\'s audio.';
        // Persist minimal state reference
        state.ytPlayer = player;
        state.ytVideoId = id;
        state.youtubeReady = true;
        return;
      } catch (e) {
        // fall through to rebuild
      }
    }

    // Ensure container exists
    if (!youtubePlayerContainer) {
      throw new Error('YouTube container missing in DOM');
    }

    player = new window.YT.Player(youtubePlayerContainer, {
      width: '320',
      height: '180',
      videoId: id,
      playerVars: {
        rel: 0,
        playsinline: 1,
        modestbranding: 1
      },
      events: {
        onReady: (ev) => {
          loadedVideoId = id;
          ready = true;
          const s = window.RG.State.state;
          s.ytPlayer = player;
          s.ytVideoId = id;
          s.youtubeReady = true;
          if (statusEl) statusEl.textContent = 'YouTube video ready. Press Space to start and share this tab\'s audio.';
        },
        onStateChange: (ev) => {
          const YTPS = window.YT.PlayerState;
          if (ev.data === YTPS.ENDED) {
            const s = window.RG.State.state;
            if (s && s.running && s.mode === 'youtube') {
              window.RG.Game.endGame(s);
            }
          }
        }
      }
    });
  }

  function isLoaded() {
    return !!(ready && player && loadedVideoId);
  }

  function play() {
    if (player && ready) {
      try { player.playVideo(); } catch {}
    }
  }

  function pause() {
    if (player) {
      try { player.pauseVideo(); } catch {}
    }
  }

  function getTitle() {
    try {
      if (player && typeof player.getVideoData === 'function') {
        const d = player.getVideoData();
        return d && d.title || '';
      }
    } catch {}
    return '';
  }

  window.RG.YouTube = {
    load,
    isLoaded,
    play,
    pause,
    getTitle,
    ensureApi
  };
})();