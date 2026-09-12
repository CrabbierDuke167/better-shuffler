// ┌─────────────────────────────────────┐
// │  better shuffler™                   │
// │  made with questionable codes       │
// │  "if it works then don't touch it"  │
// └─────────────────────────────────────┘

(() => {
  // dont load this twice or stuff starts getting weird
  if (window.__mixShufflerLoaded) return;
  window.__mixShufflerLoaded = true;

  const KEY = "ytMixShuffleState";

  // default state, basically what we start with
  const DEFAULT_STATE = {
    active: false,
    queue: [],
    index: 0,
    sourceList: "",
    sourceUrl: "",
    originalCount: 0,
    addedCount: 0,
    createdAt: 0
  };

  let state = { ...DEFAULT_STATE };
  let toastTimer = null;
  let navigatingByUs = false;
  let navigationTimeout = null;
  let advanceLock = false;

  // just makes waiting less ugly
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function extensionAlive() {
    // chrome.runtime.id disappears when the extension gets reloaded
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidated(error) {
    // chrome throws this annoying error when the extension reloads
    return /Extension context invalidated|context invalidated|Extension context/i.test(String(error?.message || error || ""));
  }

  function toast(message) {
    // no point doing anything if chrome already killed the extension (pls dont chrome)
    if (!extensionAlive()) return;

    let el = document.getElementById("mix-shuffler-toast");

    if (!el) {
      el = document.createElement("div");
      el.id = "mix-shuffler-toast";
      document.documentElement.appendChild(el);
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    // hide it after a bit
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }

  async function loadState() {
    if (!extensionAlive()) return false;

    try {
      const saved = await chrome.storage.local.get(KEY);
      state = { ...DEFAULT_STATE, ...(saved[KEY] || {}) };
      return true;
    } catch (error) {
      // extension probably got reloaded while this was running
      if (isContextInvalidated(error)) return false;
      throw error;
    }
  }

  async function saveState() {
    if (!extensionAlive()) return false;

    try {
      await chrome.storage.local.set({ [KEY]: state });
      return true;
    } catch (error) {
      // same annoying chrome reload thing
      if (isContextInvalidated(error)) return false;
      throw error;
    }
  }

  function videoIdFromUrl(url = location.href) {
    // gets the video id from the current youtube url
    try {
      return new URL(url, location.origin).searchParams.get("v");
    } catch {
      return null;
    }
  }

  function mixListFromUrl(url = location.href) {
    // gets the mix playlist id if youtube gave us one
    try {
      const list = new URL(url, location.origin).searchParams.get("list");
      return list || "";
    } catch {
      return "";
    }
  }

  function cleanTitle(s) {
    // youtube loves putting random spaces everywhere
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function durationSeconds(label) {
    if (!label) return 0;

    const p = label.trim().split(":").map(Number);

    if (p.some(Number.isNaN)) return 0;
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];

    return 0;
  }

  function addVideo(list, seen, item, allowCurrent = false) {
    // skip duplicates cuz we dont want songs showing up twice
    if (!item.id || seen.has(item.id)) return;

    // current song gets added separately
    if (!allowCurrent && item.id === videoIdFromUrl()) return;

    if (item.title.length < 2) return;

    seen.add(item.id);
    list.push(item);
  }

  function collectMix() {
    const list = [];
    const seen = new Set();

    // youtube has changed these names like 500 times
    const selectors = [
      "ytd-playlist-panel-video-renderer",
      "ytd-playlist-video-renderer"
    ];

    document.querySelectorAll(selectors.join(",")).forEach(el => {
      const a = el.querySelector(
        "a#thumbnail[href*='watch?v='], a.yt-simple-endpoint[href*='watch?v=']"
      );

      const titleEl = el.querySelector("#video-title, a#video-title");

      if (!a || !titleEl) return;

      addVideo(list, seen, {
        id: videoIdFromUrl(a.href),
        title: cleanTitle(titleEl.textContent),
        channel: cleanTitle(el.querySelector("#byline, #channel-name")?.textContent),
        duration: durationSeconds(
          el.querySelector(
            "#text.ytd-thumbnail-overlay-time-status-renderer, ytd-thumbnail-overlay-time-status-renderer #text"
          )?.textContent
        )
      });
    });

    // backup thing for when youtube decides to change the html again
    document.querySelectorAll(
      "ytd-playlist-panel-renderer a[href*='watch?v=']"
    ).forEach(a => {
      const root =
        a.closest(
          "ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer"
        ) || a.parentElement;

      addVideo(list, seen, {
        id: videoIdFromUrl(a.href),
        title: cleanTitle(
          root?.querySelector("#video-title")?.textContent ||
          a.getAttribute("title")
        ),
        channel: cleanTitle(root?.querySelector("#byline")?.textContent),
        duration: durationSeconds(root?.querySelector("#text")?.textContent)
      });
    });

    return list;
  }

  function collectRecommendations(existing) {
    const list = [];
    const seen = new Set(existing.map(x => x.id));

    // grab some of youtube's recommended songs too
    document.querySelectorAll(
      "ytd-compact-video-renderer, ytd-video-renderer"
    ).forEach(el => {
      const a = el.querySelector("a#thumbnail[href*='watch?v=']");
      const titleEl = el.querySelector("#video-title");

      if (!a || !titleEl) return;

      const id = videoIdFromUrl(a.href);
      const title = cleanTitle(titleEl.textContent);

      if (!id || seen.has(id) || a.href.includes("/shorts/")) return;
      if (/^(mix|playlist)$/i.test(title)) return;

      const durationText =
        el.querySelector("#text.ytd-thumbnail-overlay-time-status-renderer")?.textContent ||
        el.querySelector("ytd-thumbnail-overlay-time-status-renderer #text")?.textContent ||
        "";

      const duration = durationSeconds(durationText);

      // dont add 30 sec clips or 20 min random stuff
      if (duration && (duration < 120 || duration > 600)) return;

      seen.add(id);

      list.push({
        id,
        title,
        channel: cleanTitle(el.querySelector("#byline")?.textContent),
        duration
      });
    });

    return list;
  }

  function shuffle(array) {
    // fisher-yates because just sorting with random is kinda cursed
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  function currentSongItem() {
    // get some basic info about whatever is playing rn
    const current = videoIdFromUrl();

    return {
      id: current,
      title: cleanTitle(
        document.querySelector(
          "h1.ytd-watch-metadata yt-formatted-string, h1"
        )?.textContent
      ) || "Current song",
      channel: cleanTitle(
        document.querySelector("ytd-channel-name #text")?.textContent
      ),
      duration: 0
    };
  }

  function buildUrl(item) {
    // keep the mix id in the url so youtube doesnt forget the mix
    const url = new URL("https://www.youtube.com/watch");

    url.searchParams.set("v", item.id);

    if (state.sourceList) {
      url.searchParams.set("list", state.sourceList);
    }

    return url.toString();
  }

  function goTo(item) {
    if (!item?.id || !extensionAlive()) return;

    // we're the ones changing the video, not youtube
    navigatingByUs = true;

    clearTimeout(navigationTimeout);

    navigationTimeout = setTimeout(() => {
      navigatingByUs = false;
    }, 5000);

    location.href = buildUrl(item);
  }

  async function shuffleMix() {
    // load the latest state before doing anything
    if (!(await loadState())) {
      return {
        ok: false,
        error: "Extension was reloaded. Refresh YouTube and try again."
      };
    }

    let mix = collectMix();

    // youtube can take a sec to actually show the mix
    for (let i = 0; i < 8 && mix.length < 3; i++) {
      await sleep(500);
      mix = collectMix();
    }

    const recs = collectRecommendations(mix);

    // add a few extra songs so the mix isnt tiny
    const freshCount = Math.max(
      8,
      Math.min(16, Math.ceil(Math.max(mix.length, 12) * 0.45))
    );

    const fresh = shuffle(recs).slice(0, freshCount);
    const current = videoIdFromUrl();

    const currentItem =
      [...mix, ...fresh].find(x => x.id === current) ||
      currentSongItem();

    // every song gets one spot max
    const uniquePool = [];
    const queueSeen = new Set(currentItem.id ? [currentItem.id] : []);

    shuffle([...mix, ...fresh]).forEach(item => {
      if (!item.id || item.id === current || queueSeen.has(item.id)) return;

      queueSeen.add(item.id);
      uniquePool.push(item);
    });

    state = {
      active: uniquePool.length > 0,
      queue: currentItem.id
        ? [currentItem, ...uniquePool]
        : uniquePool,
      index: 0,
      sourceList: mixListFromUrl(),
      sourceUrl: location.href,
      originalCount: mix.length,
      addedCount: fresh.length,
      createdAt: Date.now()
    };

    if (!(await saveState())) {
      return {
        ok: false,
        error: "Extension was reloaded. Refresh YouTube and try again."
      };
    }

    if (!state.active) {
      toast("✕ Could not build a song queue");
      return {
        ok: false,
        error: "No songs were found on this YouTube page."
      };
    }

    toast(`✓ Shuffle active — ${state.queue.length} songs`);

    return {
      ok: true,
      count: state.queue.length,
      original: mix.length,
      added: fresh.length,
      mixContext: Boolean(state.sourceList)
    };
  }

  async function stopShuffle() {
    // reset everything back to nothing
    state = { ...DEFAULT_STATE };

    const saved = await saveState();

    if (!saved) {
      return {
        ok: false,
        error: "Extension was reloaded. Refresh YouTube first."
      };
    }

    toast("✓ Shuffle stopped");
    return { ok: true };
  }

  async function advance() {
    // dont let two ended events happen at the same time
    if (advanceLock) return;
    advanceLock = true;

    try {
      if (!(await loadState())) return;
      if (!state.active || state.queue.length < 2) return;

      const nextIndex = state.index + 1;

      // thats it, everything has played once
      if (nextIndex >= state.queue.length) {
        state.active = false;
        await saveState();

        toast("✓ Shuffle finished — all songs played once");
        return;
      }

      state.index = nextIndex;

      const next = state.queue[nextIndex];

      await saveState();

      toast(
        `✓ Next ${nextIndex + 1}/${state.queue.length}: ${next.title}`
      );

      goTo(next);

    } finally {
      advanceLock = false;
    }
  }

  async function enforceQueue() {
    // dont fight our own navigation
    if (navigatingByUs) return;

    if (!(await loadState())) return;
    if (!state.active || !state.queue.length) return;

    const expected = state.queue[state.index];

    if (!expected?.id) return;

    const current = videoIdFromUrl();

    if (current === expected.id) return;

    // youtube tried to sneak another song in
    toast("↻ Restoring shuffled queue…");
    goTo(expected);
  }

  function hookVideo() {
    const video = document.querySelector("video");

    if (!video || video.__mixShufflerHooked) return;

    video.__mixShufflerHooked = true;

    // when the song ends, move to OUR next song
    video.addEventListener("ended", () => {
      try {
        video.pause();
      } catch {}

      advance();
    });
  }

  function safeSendResponse(sendResponse, promise) {
    // handles async messages without throwing those  errors
    promise
      .then(result => {
        try {
          sendResponse(result);
        } catch {}
      })
      .catch(error => {
        try {
          sendResponse({
            ok: false,
            error: isContextInvalidated(error)
              ? "Extension was reloaded. Refresh YouTube and try again."
              : (error?.message || String(error))
          });
        } catch {}
      });
  }

  try {
    chrome.runtime.onMessage.addListener(
      (message, sender, sendResponse) => {

        if (message?.type === "SHUFFLE_MIX") {
          safeSendResponse(sendResponse, shuffleMix());
          return true;
        }

        if (message?.type === "STOP_SHUFFLE") {
          safeSendResponse(sendResponse, stopShuffle());
          return true;
        }

        if (message?.type === "GET_STATUS") {
          safeSendResponse(
            sendResponse,
            (async () => {

              if (!(await loadState())) {
                return {
                  ok: false,
                  error: "Extension was reloaded. Refresh YouTube."
                };
              }

              return {
                ok: true,
                active: state.active,
                count: state.queue.length,
                index: state.index,
                original: state.originalCount,
                added: state.addedCount,
                remaining: Math.max(
                  0,
                  state.queue.length - state.index - 1
                )
              };
            })()
          );

          return true;
        }
      }
    );
  } catch {
    // extension can disappear while chrome is reloading it
  }

  document.addEventListener("yt-navigate-finish", () => {
    navigatingByUs = false;
    clearTimeout(navigationTimeout);

    // wait a tiny bit for the new page to load
    setTimeout(() => {
      hookVideo();
      enforceQueue();
    }, 250);
  });

  document.addEventListener("yt-navigate-start", () => {
    // youtube can navigate by itself
    // dont touch the queue here, enforceQueue handles it after
    hookVideo();
  });

  // watch for youtube creating a new video element
  const observer = new MutationObserver(() => hookVideo());

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true
  });

  // load the saved shuffle when the script starts
  loadState()
    .then(ok => {
      if (!ok) return;

      hookVideo();

      setTimeout(enforceQueue, 500);
    })
    .catch(() => {});
})();

