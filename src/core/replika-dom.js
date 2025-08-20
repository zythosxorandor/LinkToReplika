import { STATE, saveHistory } from './state.js';

const seen = new Set();

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function findInput() {
  return (
    $('#send-message-textarea') ||
    $('textarea[data-testid="chat-controls-message-textarea"]') ||
    $('textarea')
  );
}

function setText(el, text) {
  const prev = el.value;
  el.value = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
  if (prev === el.value) {
    el.setRangeText(text, 0, el.value.length, 'end');
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}

async function pressEnter(el) {
  const kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
  const ku = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
  el.dispatchEvent(kd); el.dispatchEvent(ku);
}

export async function injectReply(text) {
  const input = findInput();
  if (!input) throw new Error('Replika chat input not found');
  input.focus();
  setText(input, text);
  await pressEnter(input);
  setTimeout(() => {
    const btn =
      document.querySelector('[data-testid="chat-controls"] button[type="submit"]') ||
      Array.from(document.querySelectorAll('button')).find(b => /send/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    btn?.click();
  }, 150);
}

function extractNewReplikaMessages(root = document) {
  const nodes = $$('[data-testid="chat-message-text"][data-author="replika"]', root);
  const rows = nodes.map(node => {
    const row = node.closest('[role="row"][id^="message-"]') || node.closest('[id^="message-"]');
    const id = row?.id || `node-${Math.random().toString(36).slice(2)}`;
    const text = (node.innerText || '').trim();
    return { id, text };
  }).filter(x => x.text);

  const fresh = rows.filter(x => !seen.has(x.id));
  fresh.forEach(x => seen.add(x.id));
  return fresh;
}

export function observeChat({ onIncoming }) {
  const container =
    document.querySelector('[data-testid="chat-messages"]') ||
    document.querySelector('[role="grid"]') ||
    document.body;

  const scanAndHandle = async () => {
    const fresh = extractNewReplikaMessages(container);
    if (!fresh.length) return;
    for (const m of fresh) {
      STATE.history.push({ role: 'user', content: m.text });
      await saveHistory();
      onIncoming?.(m.text);
    }
  };

  // initial scan
  scanAndHandle();

  const obs = new MutationObserver(() => scanAndHandle());
  obs.observe(container, { childList: true, subtree: true });
  return obs;
}
