/* eslint-disable no-undef */
// L2R content script: observes Replika messages and can inject replies

/* ---------- UTILITIES ---------- */
const log = (...a) => console.debug('[L2R content]', ...a);

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ---------- SEND INTO REPLIKA ---------- */
function findInput() {
  return (
    $('#send-message-textarea') ||
    $('textarea[data-testid="chat-controls-message-textarea"]') ||
    $('textarea')
  );
}

function setText(el, text) {
  const last = el.value;
  el.value = text;
  const evt = new InputEvent('input', { bubbles: true, cancelable: true, data: text });
  el.dispatchEvent(evt);
  if (last === el.value) { // nudge React tracker if needed
    el.setRangeText(text, 0, el.value.length, 'end');
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}

async function pressEnter(el) {
  const kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true });
  const ku = new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true });
  el.dispatchEvent(kd);
  el.dispatchEvent(ku);
}

function clickSendFallback() {
  const btn =
    $('[data-testid="chat-controls"] button[type="submit"]') ||
    $all('button').find(b => /send/i.test(b.getAttribute('aria-label') || b.textContent || ''));
  btn?.click();
}

async function sendTextToReplika(text) {
  const el = findInput();
  if (!el) throw new Error('chat input not found');
  el.focus();
  setText(el, text);
  await pressEnter(el);
  setTimeout(clickSendFallback, 150); // if Enter didn't send
}

/* Receive text from background and inject */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // --- health check ---
  if (msg?.type === 'L2R_PING') {
    sendResponse({ pong: true });
    return true;
  }
  
  (async () => {
    if (msg?.type === 'L2R_SEND_TEXT') {
      try {
        await sendTextToReplika(msg.text || '');
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    }
  })();
  return true;
});

/* ---------- OBSERVE NEW REPLIKA MESSAGES ---------- */
/*
We watch for rows like:
<div role="row" id="message-...">
  <div data-testid="chat-message-text" data-author="replika"> ... text ... </div>
</div>
*/
const seen = new Set();

function extractNewReplikaMessages(root = document) {
  const rows = $all('[data-testid="chat-message-text"][data-author="replika"]', root)
    .map(node => {
      const row = node.closest('[role="row"][id^="message-"]') || node.closest('[id^="message-"]');
      const id = row?.id || `node-${Math.random().toString(36).slice(2)}`;
      const text = node.innerText?.trim() || '';
      return { id, text };
    })
    .filter(x => x.text);

  const fresh = rows.filter(x => !seen.has(x.id));
  fresh.forEach(x => seen.add(x.id));
  return fresh;
}

function notifyBackground(newMsgs) {
  for (const m of newMsgs) {
    chrome.runtime.sendMessage({
      type: 'L2R_NEW_REPLIKA_MESSAGE',
      payload: { id: m.id, text: m.text }
    });
  }
}

function initialScan() {
  const fresh = extractNewReplikaMessages();
  if (fresh.length) notifyBackground(fresh);
}

function startObserver() {
  const container =
    $('[data-testid="chat-messages"]') ||
    $('[role="grid"]') ||
    document.body;

  const obs = new MutationObserver((muts) => {
    let touched = false;
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) { touched = true; break; }
    }
    if (!touched) return;
    const fresh = extractNewReplikaMessages(container);
    if (fresh.length) {
      log('new replika messages', fresh);
      notifyBackground(fresh);
    }
  });

  obs.observe(container, { childList: true, subtree: true });
  return obs;
}

/* Boot */
log('loaded');
initialScan();
startObserver();
