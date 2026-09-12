// ┌─────────────────────────────────────┐
// │  better shuffler™                   │
// │  made with questionable codes       │
// │  "if it works then don't touch it"  │
// └─────────────────────────────────────┘

const shuffleBtn = document.getElementById("shuffle");
const stopBtn = document.getElementById("stop");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");

function setStatus(text, type = "idle", stats = "") {
  // one fn dont wanna write this shit everywhere

  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
  statsEl.textContent = stats;
}

async function getYouTubeTab() {
  // gets the youtube tab thats currently open

  const tabs = await chrome.tabs.query({active: true, currentWindow: true});

  const tab = tabs[0];

  // make sure son is actually on youtube
  if (!tab || !tab.id || !tab.url || !/^https:\/\/(www\.)?youtube\.com\/watch/.test(tab.url)) {
    throw new Error("Open a normal YouTube watch page first.");
  }

  return tab;
}

async function send(tab, message) {
  // sends stuff to content.js
  // if it doesnt answer, try loading it again

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    try {
      // content script might not be loaded yet so just inject it
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["content.js"]
      });

      await chrome.scripting.insertCSS({
        target: {tabId: tab.id},
        files: ["content.css"]
      });

      // give chrome a tiny sec to load everything
      await new Promise(r => setTimeout(r, 80));

      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (err2) {
      // yeah idk what happened here but tell the user to reload
      throw new Error("Could not connect to the YouTube tab. Reload the tab once, then try again.");
    }
  }
}

async function refreshStatus() {
  // updates the popup when it opens

  try {
    const tab = await getYouTubeTab();
    const result = await send(tab, {type: "GET_STATUS"});

    if (result?.active) {
      // shuffle is already running
      setStatus(
        `✓ Shuffle active — ${result.count} songs`,
        "ok",
        `${result.original} Mix songs + ${result.added} added • ${result.index + 1}/${result.count}`
      );
    } else {
      // nothing is running rn
      setStatus("Ready — no shuffle running.");
      statsEl.textContent = "";
    }
  } catch {
    // probably not on a youtube video
    setStatus("Ready — open a YouTube video first.");
  }
}

shuffleBtn.addEventListener("click", async () => {
  // disable it so ppl dont spam click the button lol
  shuffleBtn.disabled = true;

  setStatus("Scanning Mix + recommendations…");

  try {
    const tab = await getYouTubeTab();

    // tell the content script to make the queue
    const result = await send(tab, {type: "SHUFFLE_MIX"});

    if (!result?.ok) {
      throw new Error(result?.error || "Could not build the shuffle queue.");
    }

    // tells us if yt mix was actually detected
    const context = result.mixContext
      ? "Mix context preserved"
      : "Mix context not detected";

    setStatus(
      `✓ Shuffled ${result.count} songs`,
      "ok",
      `${result.original} from Mix + ${result.added} fresh recommendations • ${context}`
    );

  } catch (err) {
    // something went wrong rip
    setStatus(`✕ ${err.message}`, "error");

  } finally {
    // button comes back even if something explodes
    shuffleBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", async () => {
  // same idea as shuffle but for stopping it
  stopBtn.disabled = true;

  try {
    const tab = await getYouTubeTab();

    const result = await send(tab, {type: "STOP_SHUFFLE"});

    // show if it actually stopped or nah
    setStatus(
      result?.ok ? "✓ Shuffle stopped" : "✕ Could not stop shuffle.",
      result?.ok ? "ok" : "error"
    );

  } catch (err) {
    setStatus(`✕ ${err.message}`, "error");

  } finally {
    // dont leave the button stuck disabled
    stopBtn.disabled = false;
  }
});

// check whats happening as soon as popup opens
refreshStatus();

