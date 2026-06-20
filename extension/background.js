/* ==========================================================================
   FocusGuard Extension - Background Service Worker (Manifest V3)
   ========================================================================== */

// Event listeners for tab updates and focus switches
chrome.tabs.onActivated.addListener(handleTabChange);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    handleTabChange();
  }
});
chrome.windows.onFocusChanged.addListener(handleTabChange);

// Periodically sync the current active tab's accumulated time even if the user doesn't switch tabs
chrome.alarms.create("syncAlarm", { periodInMinutes: 0.25 }); // Sync every 15 seconds
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncAlarm") {
    handleTabChange();
  }
});

// Listen for storage changes to instantly update connection status when saving popup form
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.syncKey || changes.databaseURL) {
    handleTabChange();
  }
});


/**
 * Main event handler triggered on tab switch, url load, window focus, or periodic alarm.
 */
async function handleTabChange() {
  try {
    const storage = await chrome.storage.local.get([
      'syncKey',
      'databaseURL',
      'activeTaskId',
      'lastActiveCheck',
      'prevUrl',
      'prevDomain',
      'prevStartTime'
    ]);

    const userId = storage.syncKey;
    const dbUrl = storage.databaseURL;

    // Extension is not configured yet
    if (!userId || !dbUrl) return;

    const now = Date.now();

    // 1. Rate-limited Firebase active task check (every 15 seconds)
    let activeTaskId = storage.activeTaskId;
    const lastCheck = storage.lastActiveCheck || 0;
    
    if (now - lastCheck > 15000) {
      activeTaskId = await fetchActiveTaskId(dbUrl, userId);
      await chrome.storage.local.set({ 
        activeTaskId: activeTaskId,
        lastActiveCheck: now 
      });
    }

    // 2. Query the current active tab
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    // 3. Process previous tab duration if active task is running
    const prevUrl = storage.prevUrl;
    const prevDomain = storage.prevDomain;
    const prevStartTime = storage.prevStartTime;

    if (activeTaskId && prevUrl && prevStartTime && isTrackableUrl(prevUrl)) {
      const elapsedSeconds = Math.floor((now - prevStartTime) / 1000);
      if (elapsedSeconds > 0) {
        // Push the accumulated duration to Firebase REST endpoint
        await syncSiteTime(dbUrl, userId, activeTaskId, prevUrl, prevDomain, elapsedSeconds);
      }
    }

    // 4. Update storage with the new active tab (or clear it if window lost focus)
    if (activeTab && activeTab.url && isTrackableUrl(activeTab.url)) {
      const currentDomain = new URL(activeTab.url).hostname;
      const cleanCurrentUrl = cleanUrl(activeTab.url);

      await chrome.storage.local.set({
        prevUrl: cleanCurrentUrl,
        prevDomain: currentDomain,
        prevStartTime: now
      });
    } else {
      // User clicked outside Chrome (focused on a native IDE, folder, etc.)
      await chrome.storage.local.set({
        prevUrl: '',
        prevDomain: '',
        prevStartTime: 0
      });
    }
  } catch (error) {
    console.error("FocusGuard background tracking error:", error);
  }
}

/**
 * Fetch the user's currently active task from Firebase Realtime Database.
 */
async function fetchActiveTaskId(dbUrl, userId) {
  const url = `${dbUrl}/users/${userId}/active.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch active task ID:", e);
    return null;
  }
}

/**
 * Synchronize visited site elapsed duration to Firebase using REST API.
 */
async function syncSiteTime(dbUrl, userId, taskId, siteUrl, domain, elapsedSeconds) {
  const siteKey = getSafeKey(siteUrl);
  const siteUrlNode = `${dbUrl}/users/${userId}/tasks/${taskId}/sites/${siteKey}.json`;

  try {
    // Step A: Fetch current site log details
    const res = await fetch(siteUrlNode);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const currentSiteData = await res.json();

    if (!currentSiteData) {
      // Step B1: Site does not exist yet under this task. Create it with PATCH
      const patchRes = await fetch(siteUrlNode, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: siteUrl,
          dom: domain,
          dur: elapsedSeconds,
          cat: 'none',
          cmt: ''
        })
      });
      if (!patchRes.ok) throw new Error(`PATCH status ${patchRes.status}`);
    } else {
      // Step B2: Site exists. Update duration with PUT on the specific dur node
      const newDur = (currentSiteData.dur || 0) + elapsedSeconds;
      const putRes = await fetch(`${dbUrl}/users/${userId}/tasks/${taskId}/sites/${siteKey}/dur.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDur)
      });
      if (!putRes.ok) throw new Error(`PUT status ${putRes.status}`);
    }
  } catch (e) {
    console.error("Failed to sync site time to Firebase:", e);
  }
}

/**
 * Helper: Create a URL path-safe key for Firebase database compatibility.
 */
function getSafeKey(str) {
  return str.replace(/[\.\#\$\[\]\/]/g, '_').substring(0, 120);
}

/**
 * Helper: Strip hashes and trailing slashes to avoid duplicate logs.
 */
function cleanUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.origin + url.pathname + url.search;
  } catch(e) {
    return urlStr;
  }
}

/**
 * Helper: Validate that a URL is a web URL (we ignore system, extension, and newtab pages).
 */
function isTrackableUrl(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}
