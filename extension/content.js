/* ==========================================================================
   FocusGuard Extension - Content Script (content.js)
   ========================================================================== */

// Listen for messages from the web page window and forward them to the background worker
window.addEventListener("message", (event) => {
  // Only accept messages from our own window
  if (event.source !== window) return;

  if (event.data && (event.data.type === "FOCUS_GUARD_SYNC" || event.data.type === "FOCUS_GUARD_TIMER")) {
    chrome.runtime.sendMessage(event.data);
  }
});
