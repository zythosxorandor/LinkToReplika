// src/content/replika-observer.js
/* eslint-disable no-undef */

const MSG_GRID_SELECTOR = '[data-testid="chat-messages"][role="grid"]';
const MSG_TEXT_SELECTOR = `${MSG_GRID_SELECTOR} [role="row"] [data-testid="chat-message-text"]`;

const sentIds = new Set();           // rows we've already emitted
const pendingTimers = new Map();     // rowId -> timeout

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function closestRow(el) {
  return el.closest('[role="row"][id^="message-"]');
}

function normText(s) {
  return (s || '')
    .replace(/\u200b/g, '')          // zero-width spaces
    .replace(/\s+/g, ' ')            // squash whitespace
    .trim();
}

function extractPayload(textEl) {
  const row = closestRow(textEl);
  if (!row) return null;

  const id = row.id; // e.g., "message-68a3a853022958341c812d3a"
  const author = textEl.dataset.author || 'unknown';
  const text = normText(textEl.innerText || textEl.textContent || '');

  const tsCell = row.querySelector('[aria-colindex="3"]');
  const tsLabel = normText(tsCell?.innerText || '');

  return {
    id,
    author,
    text,
    tsLabel,
    url: location.href,
    observedAt: Date.now(),
  };
}

// Debounce to avoid multiple pings while a Replika message streams in
function scheduleEmit(textEl, delayMs = 500) {
  const row = closestRow(textEl);
  if (!row) return;
  const rowId = row.id || `row-${Math.random().toString(36).slice(2)}`;

  // If we've already sent this row, bail
  if (sentIds.has(rowId)) return;

  // Reset the timer if the text is still changing
  if (pendingTimers.has(rowId)) {
    clearTimeout(pendingTimers.get(rowId));
  }

  const t = setTimeout(() => {
    const payload = extractPayload(textEl);
    if (!payload) return;
    if (payload.author !== 'replika') return;        // only ping on Replika messages
    if (!payload.text) return;

    sentIds.add(rowId);
    pendingTimers.delete(rowId);

    chrome.runtime.sendMessage({
      type: 'L2R_NEW_REPLIKA_MESSAGE',
      payload,
    });
    // Optional: local debug
    console.debug('[LinkToReplika] New Replika message → background', payload);
  }, delayMs);

  pendingTimers.set(rowId, t);
}

function observeTextEl(textEl) {
  // Only care about Replika-authored message nodes
  if (textEl?.dataset?.author !== 'replika') return;

  // Kick a schedule once we see it (for messages that appear fully formed)
  scheduleEmit(textEl);

  // Also watch for streaming edits inside this text node
  const textObserver = new MutationObserver(() => scheduleEmit(textEl));
  textObserver.observe(textEl, { childList: true, subtree: true, characterData: true });
}

function observeMessageGrid(grid) {
  // Bootstrap: attach to any existing messages (won't re-emit thanks to debouncing + sentIds)
  grid.querySelectorAll(MSG_TEXT_SELECTOR).forEach(observeTextEl);

  // Watch for newly added rows/messages
  const gridObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;

        // If the added node *is* a textEl
        if (node.matches?.('[data-testid="chat-message-text"]')) {
          observeTextEl(node);
        }

        // Or if it *contains* message text descendants
        const newTextEls = node.querySelectorAll?.('[data-testid="chat-message-text"]');
        if (newTextEls?.length) {
          newTextEls.forEach(observeTextEl);
        }
      }
    }
  });

  gridObserver.observe(grid, { childList: true, subtree: true });
  console.debug('[LinkToReplika] Message grid observer attached');
}

async function start() {
  // The chat list is rendered dynamically—wait for it
  let grid = document.querySelector(MSG_GRID_SELECTOR);
  const startDeadline = Date.now() + 15000;

  while (!grid && Date.now() < startDeadline) {
    await sleep(250);
    grid = document.querySelector(MSG_GRID_SELECTOR);
  }

  if (!grid) {
    console.warn('[LinkToReplika] chat messages grid not found');
    return;
  }

  observeMessageGrid(grid);

  // In case SPA navigation replaces the grid, watch the whole doc for a new grid and re-attach
  const docObserver = new MutationObserver(() => {
    const nextGrid = document.querySelector(MSG_GRID_SELECTOR);
    if (nextGrid && nextGrid !== grid) {
      console.debug('[LinkToReplika] chat messages grid replaced; re-attaching');
      observeMessageGrid(nextGrid);
      grid = nextGrid;
    }
  });
  docObserver.observe(document.documentElement, { childList: true, subtree: true });
}

start();
