const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findElement(selector) {
  // Try strict CSS first
  let el = document.querySelector(selector);
  if (el) return el;

  // Heuristic for chat inputs if a broad selector was used
  if (selector.includes('textarea') || selector.includes('[contenteditable="true"]')) {
    // Prefer the visible, enabled input
    const candidates = [
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('[contenteditable="true"]')
    ].filter((n) => {
      const s = window.getComputedStyle(n);
      return s.visibility !== 'hidden' && s.display !== 'none' && !n.disabled && n.offsetParent !== null;
    });

    // Prefer ones with "message" or "type" in placeholder/aria
    candidates.sort((a, b) => {
      const score = (n) => {
        const p = (n.getAttribute('placeholder') || '').toLowerCase();
        const a = (n.getAttribute('aria-label') || '').toLowerCase();
        const h = (n.getAttribute('data-testid') || '').toLowerCase();
        return [p, a, h].some((t) => /message|type|chat|reply/.test(t)) ? 1 : 0;
      };
      return score(b) - score(a);
    });

    return candidates[0] || null;
  }
  return null;
}

async function waitFor({ selector, timeoutMs = 10000, pollMs = 100 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = findElement(selector);
    if (el) return el;
    await sleep(pollMs);
  }
  throw new Error(`waitFor: timed out waiting for "${selector}"`);
}

function setNativeValue(el, text) {
  // Handle both textarea/inputs and contenteditable
  if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } else {
    const valueSetter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
    valueSetter ? valueSetter.call(el, text) : (el.value = text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function doClick({ selector }) {
  const el = await waitFor({ selector });
  el.focus();
  el.click();
}

async function doType({ selector, text }) {
  const el = await waitFor({ selector });
  el.focus();
  setNativeValue(el, text);
}

async function doFocus({ selector }) {
  const el = await waitFor({ selector });
  el.focus();
}

async function doDelay({ ms }) {
  await sleep(ms);
}

async function doReadText({ selector }) {
  const el = await waitFor({ selector });
  return el.innerText || el.value || el.textContent || '';
}

export class AutomationRunner {
  constructor() {
    this.handlers = {
      waitFor,
      click: doClick,
      type: doType,
      focus: doFocus,
      delay: doDelay,
      readText: doReadText
    };
  }

  async run(steps = []) {
    const results = [];
    for (const step of steps) {
      const { cmd, ...args } = step;
      const handler = this.handlers[cmd];
      if (!handler) throw new Error(`Unknown cmd: ${cmd}`);
      const out = await handler(args);
      results.push(out ?? null);
    }
    return results;
  }
}
