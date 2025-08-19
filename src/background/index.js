/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import { OpenAIChatClient, ChatMessageHistory } from './openaiClient.js';

const sessions = new Map();      // tabId -> { ...session }
const popupPorts = new Map();    // tabId -> Port

const DEFAULTS = {
    enabled: false,
    approve: false,
    maxTurns: 20,
    systemPrompt: "You are 'OpenAI Link'. Talk concisely. Avoid long monologues. Respond naturally.",
    busy: false,
    turns: 0,
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pingContent(tabId, timeout = 800) {
    return new Promise((resolve) => {
        let done = false;
        try {
            chrome.tabs.sendMessage(tabId, { type: 'L2R_PING' }, (resp) => {
                done = true;
                if (chrome.runtime.lastError) return resolve(false);
                resolve(!!resp?.pong);
            });
        } catch {
            resolve(false);
        }
        setTimeout(() => { if (!done) resolve(false); }, timeout);
    });
}

async function ensureContentInjected(tabId) {
    // If content is alive, great.
    if (await pingContent(tabId)) return true;

    // Try to inject (works even if already injected).
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: [chrome.runtime.getURL('src/content/replika-content.js')],
        });
        await sleep(120);
    } catch (_) {
        // ignore (e.g., wrong URL or file path)
    }

    // Ping again.
    return await pingContent(tabId);
}

// Safe send wrapper (prevents "Receiving end does not exist")
async function safeSendToTab(tabId, message) {
    const alive = await ensureContentInjected(tabId);
    if (!alive) throw new Error('Content script not available on this tab');
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.sendMessage(tabId, message, (resp) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                resolve(resp);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function getSession(tabId) {
    if (!sessions.has(tabId)) {
        sessions.set(tabId, {
            ...DEFAULTS,
            history: new ChatMessageHistory(),
            client: new OpenAIChatClient({ loggingEnabled: false }),
        });
    }
    return sessions.get(tabId);
}

function broadcast(tabId, payload) {
    const port = popupPorts.get(tabId);
    port?.postMessage(payload);
}

/* ---------- POPUP CONNECTION ---------- */
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'L2R_POPUP') return;

    let boundTabId = null;

    port.onMessage.addListener(async (msg) => {
        if (msg?.type === 'L2R_BIND_TAB') {
            boundTabId = msg.tabId;
            popupPorts.set(boundTabId, port);
            const s = getSession(boundTabId);
            port.postMessage({
                type: 'L2R_STATE',
                payload: {
                    enabled: s.enabled,
                    approve: s.approve,
                    maxTurns: s.maxTurns,
                    systemPrompt: s.systemPrompt,
                    busy: s.busy,
                    turns: s.turns,
                    history: s.history.messages,
                },
            });
            return;
        }

        if (!boundTabId) return; // not bound yet

        const s = getSession(boundTabId);

        if (msg?.type === 'L2R_SET_ENABLED') {
            s.enabled = !!msg.enabled;
            broadcast(boundTabId, { type: 'L2R_STATE_PATCH', payload: { enabled: s.enabled } });
        }
        if (msg?.type === 'L2R_SET_APPROVE') {
            s.approve = !!msg.approve;
            broadcast(boundTabId, { type: 'L2R_STATE_PATCH', payload: { approve: s.approve } });
        }
        if (msg?.type === 'L2R_SET_MAX_TURNS') {
            s.maxTurns = Math.max(1, Number(msg.maxTurns) || DEFAULTS.maxTurns);
            broadcast(boundTabId, { type: 'L2R_STATE_PATCH', payload: { maxTurns: s.maxTurns } });
        }
        if (msg?.type === 'L2R_SET_SYSTEM_PROMPT') {
            s.systemPrompt = String(msg.systemPrompt || DEFAULTS.systemPrompt);
            broadcast(boundTabId, { type: 'L2R_STATE_PATCH', payload: { systemPrompt: s.systemPrompt } });
        }
        if (msg?.type === 'L2R_STOP') {
            s.busy = false;
            broadcast(boundTabId, { type: 'L2R_STATE_PATCH', payload: { busy: false } });
        }
        if (msg?.type === 'L2R_CLEAR') {
            s.history.clear();
            s.turns = 0;
            broadcast(boundTabId, { type: 'L2R_STATE_PATCH', payload: { history: [], turns: 0 } });
        }
        if (msg?.type === 'L2R_MANUAL_SEND') {
            try {
                await safeSendToTab(boundTabId, { type: 'L2R_SEND_TEXT', text: msg.text || '' });
            } catch (e) {
                broadcast(boundTabId, { type: 'L2R_ERROR', payload: `Send failed: ${e.message}` });
            }
        }
    });

    port.onDisconnect.addListener(() => {
        if (boundTabId) {
            if (popupPorts.get(boundTabId) === port) popupPorts.delete(boundTabId);
        }
    });
});

/* ---------- CONTENT EVENTS: Replika -> OpenAI -> Replika ---------- */
chrome.runtime.onMessage.addListener((msg, sender) => {
    (async () => {
        if (msg?.type !== 'L2R_NEW_REPLIKA_MESSAGE') return;

        const tabId = sender?.tab?.id;
        if (!tabId) return;

        const s = getSession(tabId);
        const text = msg.payload?.text || '';

        // Log incoming
        s.history.addMessage({ role: 'user', content: text });
        broadcast(tabId, { type: 'L2R_LOG', payload: { role: 'replika', content: text, t: Date.now() } });

        if (!s.enabled || s.busy) return;
        if (s.turns >= s.maxTurns) {
            broadcast(tabId, { type: 'L2R_INFO', payload: 'Max turns reached' });
            return;
        }

        s.busy = true;
        broadcast(tabId, { type: 'L2R_STATE_PATCH', payload: { busy: true } });

        try {
            // Optional system prompt
            if (s.systemPrompt) s.history.addMessage({ role: 'system', content: s.systemPrompt });

            const reply = await s.client.generate(text, /*track*/ false);

            s.history.addMessage({ role: 'assistant', content: reply });
            s.turns += 1;

            broadcast(tabId, { type: 'L2R_LOG', payload: { role: 'openai', content: reply, t: Date.now() } });
            broadcast(tabId, { type: 'L2R_STATE_PATCH', payload: { turns: s.turns } });

            if (!s.approve) {
                try {
                    await safeSendToTab(tabId, { type: 'L2R_SEND_TEXT', text: reply });
                } catch (e) {
                    broadcast(tabId, { type: 'L2R_ERROR', payload: `Inject failed: ${e.message}` });
                }
            }
        } catch (e) {
            broadcast(tabId, { type: 'L2R_ERROR', payload: String(e) });
        } finally {
            s.busy = false;
            broadcast(tabId, { type: 'L2R_STATE_PATCH', payload: { busy: false } });
        }
    })();
    return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  try {
    const url = tab?.url || '';
    if (/^https:\/\/my\.replika\.com\/?/i.test(url)) {
      // Best-effort keepalive/inject
      await ensureContentInjected(tabId);
    }
  } catch { console.log('Error in onUpdated'); }
});
