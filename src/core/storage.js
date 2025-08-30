/* eslint-disable no-undef */
// Robust storage wrapper that tolerates extension reloads/navigation where
// the content-script context can be invalidated. Falls back to in-memory
// storage when chrome.storage is unavailable or throws.

const memory = {};

function hasChromeStorage() {
  try {
    // runtime.id is undefined when the extension context is gone
    return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
  } catch {
    return false;
  }
}

function isInvalidated(err) {
  return err && typeof err.message === 'string' && err.message.toLowerCase().includes('extension context invalidated');
}

export const storage = {
  async get(keys) {
    if (!hasChromeStorage()) {
      // Return whatever we have in-memory (best effort)
      const out = {};
      (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in memory) out[k] = memory[k]; });
      return out;
    }
    return new Promise((res) => {
      try {
        chrome.storage.local.get(keys, (v) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            const out = {};
            (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in memory) out[k] = memory[k]; });
            return res(out);
          }
          res(v || {});
        });
      } catch (e) {
        if (!isInvalidated(e)) console.warn('storage.get failed:', e);
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in memory) out[k] = memory[k]; });
        res(out);
      }
    });
  },
  async set(obj) {
    // Always update memory fallback
    try { Object.assign(memory, obj || {}); } catch {}
    if (!hasChromeStorage()) return;
    return new Promise((res) => {
      try {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime && chrome.runtime.lastError) return res();
          res();
        });
      } catch (e) {
        if (!isInvalidated(e)) console.warn('storage.set failed:', e);
        res();
      }
    });
  },
};
