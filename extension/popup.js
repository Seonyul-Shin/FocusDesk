/* ==========================================================================
   FocusGuard Extension - Popup Controller (popup.js)
   ========================================================================== */

const syncForm = document.getElementById('sync-form');
const syncKeyInput = document.getElementById('syncKey');
const databaseURLInput = document.getElementById('databaseURL');
const syncStatusBadge = document.getElementById('sync-status');
const trackingStatusText = document.getElementById('tracking-status');
const toast = document.getElementById('toast');

// Load stored settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['syncKey', 'databaseURL', 'activeTaskId']);
  
  if (data.syncKey) {
    syncKeyInput.value = data.syncKey;
  }
  if (data.databaseURL) {
    databaseURLInput.value = data.databaseURL;
  }

  updateStatusUI(data.syncKey, data.databaseURL, data.activeTaskId);
  
  // Real-time double-check status with database on open
  if (data.syncKey && data.databaseURL) {
    checkCurrentActiveTask(data.databaseURL, data.syncKey);
  }
});

// Handle form submission
syncForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  let syncKey = syncKeyInput.value.trim();
  let dbUrl = databaseURLInput.value.trim();

  // Strip trailing slash from database URL if exists
  if (dbUrl.endsWith('/')) {
    dbUrl = dbUrl.slice(0, -1);
  }

  // Save to chrome storage
  await chrome.storage.local.set({
    syncKey: syncKey,
    databaseURL: dbUrl,
    activeTaskId: null, // Reset and let background query it
    lastActiveCheck: 0   // Force background service worker to fetch immediately
  });

  // Display success message
  showToast();
  
  // Check active task status immediately
  checkCurrentActiveTask(dbUrl, syncKey);
});

/**
 * Check active task status directly from Firebase REST API.
 */
async function checkCurrentActiveTask(dbUrl, userId) {
  const url = `${dbUrl}/users/${userId}/active.json`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP status " + res.status);
    const activeTaskId = await res.json();
    
    // Save to storage
    await chrome.storage.local.set({ 
      activeTaskId: activeTaskId,
      lastActiveCheck: Date.now()
    });

    updateStatusUI(userId, dbUrl, activeTaskId);
  } catch (error) {
    console.error("Popup status fetch error:", error);
    syncStatusBadge.textContent = "연결 오류";
    syncStatusBadge.className = "status-badge disconnected";
    trackingStatusText.textContent = "서버 연결 확인 필요";
    trackingStatusText.className = "status-val text-danger";
  }
}

/**
 * Update UI labels based on settings.
 */
function updateStatusUI(syncKey, databaseURL, activeTaskId) {
  if (syncKey && databaseURL) {
    syncStatusBadge.textContent = "연동됨";
    syncStatusBadge.className = "status-badge connected";
    
    if (activeTaskId) {
      trackingStatusText.textContent = "과제 측정 중";
      trackingStatusText.className = "status-val text-success";
      // Change badge class to represent active tracking state
      syncStatusBadge.textContent = "측정중";
      syncStatusBadge.className = "status-badge tracking";
    } else {
      trackingStatusText.textContent = "대기 중 (타이머 중지)";
      trackingStatusText.className = "status-val text-muted";
    }
  } else {
    syncStatusBadge.textContent = "미설정";
    syncStatusBadge.className = "status-badge disconnected";
    trackingStatusText.textContent = "연동 키 입력 필요";
    trackingStatusText.className = "status-val text-muted";
  }
}

function showToast() {
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}
