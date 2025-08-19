/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// src/content/replika-panel.js
(() => {
    /**********************
     * UTILS + STORAGE
     **********************/
    const log = (...a) => console.debug('[L2R]', ...a);
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const storage = {
        async get(keys) {
            return new Promise((res) => chrome.storage.local.get(keys, res));
        },
        async set(obj) {
            return new Promise((res) => chrome.storage.local.set(obj, res));
        },
    };

    const HISTORY_STORE_KEY = 'L2R_HISTORY';
    const TURNS_STORE_KEY = 'L2R_TURNS';
    const MAX_CTX_MSGS = 32;
    const MAX_CTX_CHARS = 15000;

    function clampHistory() {
        let msgs = STATE.history.slice(-MAX_CTX_MSGS);
        const chars = arr => arr.reduce((n, m) => n + (m.content?.length || 0), 0);
        while (chars(msgs) > MAX_CTX_CHARS && msgs.length > 8) msgs.shift();
        STATE.history = msgs;
    }

    async function saveHistory() {
        clampHistory();
        await storage.set({
            [HISTORY_STORE_KEY]: STATE.history,
            [TURNS_STORE_KEY]: STATE.turns
        });
    }



    const DEFAULTS = {
        OPENAI_KEY: '',
        OPENAI_MODEL: 'gpt-4o-mini',
        L2R_ENABLED: false,
        L2R_APPROVE: false,
        L2R_MAX_TURNS: 20,
        L2R_SYSTEM_PROMPT: "You are 'OpenAI Link'. Reply concisely and naturally.",
    };

    let STATE = {
        enabled: false,
        approve: false,
        maxTurns: 20,
        systemPrompt: DEFAULTS.L2R_SYSTEM_PROMPT,
        key: '',
        model: 'gpt-4o-mini',
        busy: false,
        turns: 0,
        // light message history for the LLM (role: 'system'|'user'|'assistant', content)
        history: [],
    };

    function clip(str, n = 6000) {
        if (!str) return '';
        return str.length > n ? str.slice(0, n) + '…' : str;
    }

    /**********************
     * REPLIKA DOM HOOKS
     **********************/
    function findInput() {
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
            // nudge React tracker if needed
            el.setRangeText(text, 0, el.value.length, 'end');
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }
    }

    async function pressEnter(el) {
        const kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        const ku = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        el.dispatchEvent(kd);
        el.dispatchEvent(ku);
    }

    function clickSendFallback() {
        const btn =
            $('[data-testid="chat-controls"] button[type="submit"]') ||
            $$('button').find(b => /send/i.test(b.getAttribute('aria-label') || b.textContent || ''));
        btn?.click();
    }

    async function injectReply(text) {
        const input = findInput();
        if (!input) throw new Error('Replika chat input not found');
        input.focus();
        setText(input, text);
        await pressEnter(input);
        setTimeout(clickSendFallback, 150);
    }

    /**********************
     * OPENAI CLIENT (content-script fetch)
     **********************/
    async function openaiChatComplete({ key, model, messages, temperature = 0.7, max_tokens = 400 }) {
        if (!key) throw new Error('OpenAI key missing (set it in the panel)');
        const payload = {
            model,
            messages,
            temperature,
            max_tokens,
        };
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`OpenAI error ${resp.status}: ${t}`);
        }
        const json = await resp.json();
        const out = json?.choices?.[0]?.message?.content || '';
        return out.trim();
    }

    /**********************
     * MESSAGE OBSERVER
     **********************/
    const seen = new Set();

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

    function observeChat() {
        const container =
            $('[data-testid="chat-messages"]') ||
            $('[role="grid"]') ||
            document.body;

        const scanAndHandle = async () => {
            const fresh = extractNewReplikaMessages(container);
            if (!fresh.length) return;
            for (const m of fresh) {
                addLog('replika', m.text);
                onIncomingReplika(m.text);
            }
        };

        // initial scan (page already has messages)
        scanAndHandle();

        const obs = new MutationObserver(() => scanAndHandle());
        obs.observe(container, { childList: true, subtree: true });
        return obs;
    }

    /**********************
     * LINKING LOGIC
     **********************/
    let approveQueue = []; // items awaiting manual approval

    async function onIncomingReplika(text) {
        // track as "user" to OpenAI
        STATE.history.push({ role: 'user', content: text });
        await saveHistory();

        if (!STATE.enabled || STATE.busy) return;
        if (STATE.turns >= STATE.maxTurns) {
            addLog('info', 'Max turns reached; disable/restart to continue.');
            return;
        }
        if (!STATE.key) {
            addLog('error', 'No OpenAI key set.');
            return;
        }

        STATE.busy = true;
        setBusy(true);

        try {
            const msgs = [
                ...(STATE.systemPrompt ? [{ role: 'system', content: STATE.systemPrompt }] : []),
                ...STATE.history.slice(-16), // keep it light
            ];

            const reply = await openaiChatComplete({
                key: STATE.key,
                model: STATE.model,
                messages: msgs,
                temperature: 0.7,
                max_tokens: 400,
            });

            STATE.history.push({ role: 'assistant', content: reply });
            STATE.turns += 1;
            setTurns(STATE.turns);
            addLog('openai', reply);
            await saveHistory();

            if (STATE.approve) {
                addApprovalChip(reply);
            } else {
                await injectReply(reply);
            }
        } catch (e) {
            addLog('error', String(e.message || e));
        } finally {
            STATE.busy = false;
            setBusy(false);
        }
    }

    /**********************
     * PANEL UI (Shadow DOM)
     **********************/
    let rootHost, shadow, ui = {};

    function injectPanel() {
        if (rootHost) return; // already
        rootHost = document.createElement('div');
        rootHost.id = '__l2r_panel_host';
        rootHost.style.all = 'initial';
        rootHost.style.position = 'fixed';
        rootHost.style.zIndex = '999999';
        rootHost.style.right = '14px';
        rootHost.style.bottom = '14px';
        rootHost.style.width = '380px';
        rootHost.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        document.documentElement.appendChild(rootHost);

        shadow = rootHost.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
      :host { all: initial; }
      .card {
        all: initial;
        display: block;
        width: 100%;
        background: #111827F2;
        color: white;
        border: 1px solid #1f2937;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
        font-family: inherit;
        overflow: hidden;
      }
      .hdr {
        display:flex; align-items:center; gap:8px;
        padding:10px 12px; background:#0b1220; border-bottom:1px solid #1f2937;
        cursor: move;
      }
      .hdr h3 { margin:0; font-size:14px; font-weight:600; letter-spacing:.2px }
      .hdr .pill { margin-left:auto; font-size:10px; opacity:.8; background:#1f2937; padding:3px 6px; border-radius:999px }
      .body { padding:10px 12px; display:grid; gap:10px; }
      label { font-size:12px; opacity:.9; display:block; margin-bottom:4px }
      input, select, textarea, button {
        font-family: inherit; font-size:12px; color:#e5e7eb;
        background:#0f172a; border:1px solid #273248; border-radius:8px; padding:7px 8px;
      }
      input::placeholder, textarea::placeholder { color:#64748b; }
      input:focus, select:focus, textarea:focus { outline:1px solid #3b82f6; border-color:#3b82f6; }
      .row { display:grid; gap:6px }
      .hrow { display:flex; gap:8px; align-items:center; }
      .hrow > * { flex:1 }
      .toggle { display:flex; gap:8px; align-items:center; }
      .toggle input[type=checkbox] { width:16px; height:16px; }
      .log {
        background:#0a0f1f; border:1px dashed #273248; border-radius:8px; padding:8px;
        height:180px; overflow:auto; color:#e5e7eb; font-size:12px; line-height:1.35;
      }
      .log .line { margin-bottom:6px; white-space:pre-wrap; }
      .tag { display:inline-block; min-width:60px; font-size:11px; opacity:.85 }
      .tag.replika { color:#10b981; }
      .tag.openai { color:#60a5fa; }
      .tag.info   { color:#9ca3af; }
      .tag.error  { color:#f87171; }
      .chip {
        border:1px solid #334155; background:#0b1326; border-radius:8px; padding:6px; margin-top:6px;
      }
      .chip .actions { display:flex; gap:6px; margin-top:6px; }
      .row-inline { display:flex; gap:8px; }
      .small { font-size:11px; opacity:.8 }
      .btn { cursor:pointer }
      .btn.primary { background:#1d4ed8; border-color:#1d4ed8; }
      .btn:disabled { opacity:.5; cursor:not-allowed; }
      .muted { opacity:.7 }
      .mini { font-size:10px; padding:4px 6px; }
    `;
        shadow.appendChild(style);

        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = `
      <div class="hdr" id="l2rDragBar">
        <h3>LinkToReplika</h3>
        <span class="pill" id="l2rStatus">Idle</span>
      </div>
      <div class="body">
        <div class="row">
          <label>OpenAI API Key</label>
          <div class="row-inline">
            <input id="l2rKey" type="password" placeholder="sk-..." />
            <button class="btn mini" id="l2rShowKey">Show</button>
            <button class="btn mini" id="l2rSaveKey">Save</button>
          </div>
        </div>

        <div class="row">
          <label>Model</label>
          <div class="row-inline">
            <select id="l2rModel">
              <option>gpt-4o-mini</option>
              <option>gpt-4o</option>
              <option>o4-mini</option>
              <option value="__custom__">Custom…</option>
            </select>
            <input id="l2rModelCustom" placeholder="custom model id" style="display:none" />
            <button class="btn mini" id="l2rSaveModel">Save</button>
          </div>
        </div>

        <div class="hrow">
          <label class="toggle">
            <input type="checkbox" id="l2rEnabled" />
            <span>Link OpenAI ↔ Replika</span>
          </label>
          <label class="toggle">
            <input type="checkbox" id="l2rApprove" />
            <span>Approve before sending</span>
          </label>
          <div class="hrow" style="flex:0 0 120px">
            <label class="small muted">Max turns</label>
            <input type="number" id="l2rMaxTurns" min="1" value="20" />
          </div>
        </div>

        <div class="row">
          <label>System prompt (optional)</label>
          <textarea id="l2rSystem" rows="3" placeholder="${DEFAULTS.L2R_SYSTEM_PROMPT.replace(/"/g, '&quot;')}"></textarea>
        </div>

        <div class="row">
          <label>Manual send</label>
          <div class="row-inline">
            <input id="l2rManual" placeholder="Type and inject into Replika" />
            <button class="btn" id="l2rManualSend">Send</button>
          </div>
        </div>

        <div class="row">
          <label class="hrow">
            <span>Live log</span>
            <button class="btn mini" id="l2rClearLog">Clear</button>
          </label>
          <div class="log" id="l2rLog"></div>
          <div id="l2rApproveList"></div>
        </div>

        <div class="small muted">Tip: press <strong>Ctrl+Shift+L</strong> to toggle the panel.</div>
      </div>
    `;
        shadow.appendChild(wrap);

        // Wire controls
        ui.status = shadow.getElementById('l2rStatus');
        ui.key = shadow.getElementById('l2rKey');
        ui.showKey = shadow.getElementById('l2rShowKey');
        ui.saveKey = shadow.getElementById('l2rSaveKey');
        ui.model = shadow.getElementById('l2rModel');
        ui.modelCustom = shadow.getElementById('l2rModelCustom');
        ui.saveModel = shadow.getElementById('l2rSaveModel');
        ui.enabled = shadow.getElementById('l2rEnabled');
        ui.approve = shadow.getElementById('l2rApprove');
        ui.maxTurns = shadow.getElementById('l2rMaxTurns');
        ui.system = shadow.getElementById('l2rSystem');
        ui.manual = shadow.getElementById('l2rManual');
        ui.manualSend = shadow.getElementById('l2rManualSend');
        ui.log = shadow.getElementById('l2rLog');
        ui.approveList = shadow.getElementById('l2rApproveList');

        // Dragging
        makeDraggable(shadow.getElementById('l2rDragBar'), rootHost);

        // Events
        ui.showKey.addEventListener('click', () => {
            ui.key.type = ui.key.type === 'password' ? 'text' : 'password';
            ui.showKey.textContent = ui.key.type === 'password' ? 'Show' : 'Hide';
        });
        ui.saveKey.addEventListener('click', async () => {
            await storage.set({ OPENAI_KEY: ui.key.value.trim() });
            STATE.key = ui.key.value.trim();
            addLog('info', 'Key saved.');
        });

        ui.model.addEventListener('change', () => {
            if (ui.model.value === '__custom__') {
                ui.modelCustom.style.display = '';
                ui.modelCustom.focus();
            } else {
                ui.modelCustom.style.display = 'none';
            }
        });
        ui.saveModel.addEventListener('click', async () => {
            const value = ui.model.value === '__custom__' ? ui.modelCustom.value.trim() : ui.model.value;
            if (!value) return;
            await storage.set({ OPENAI_MODEL: value });
            STATE.model = value;
            addLog('info', `Model: ${value}`);
        });

        ui.enabled.addEventListener('change', async () => {
            STATE.enabled = ui.enabled.checked;
            await storage.set({ L2R_ENABLED: STATE.enabled });
            addLog('info', STATE.enabled ? 'Linking enabled' : 'Linking disabled');
        });
        ui.approve.addEventListener('change', async () => {
            STATE.approve = ui.approve.checked;
            await storage.set({ L2R_APPROVE: STATE.approve });
        });
        ui.maxTurns.addEventListener('change', async () => {
            const v = Math.max(1, Number(ui.maxTurns.value || 20));
            STATE.maxTurns = v;
            await storage.set({ L2R_MAX_TURNS: v });
            setTurns(STATE.turns);
        });
        ui.system.addEventListener('blur', async () => {
            STATE.systemPrompt = ui.system.value.trim();
            await storage.set({ L2R_SYSTEM_PROMPT: STATE.systemPrompt });
        });

        ui.manualSend.addEventListener('click', async () => {
            try {
                const txt = ui.manual.value.trim();
                if (!txt) return;
                await injectReply(txt);
                ui.manual.value = '';
            } catch (e) {
                addLog('error', `Manual send failed: ${String(e.message || e)}`);
            }
        });

        shadow.getElementById('l2rClearLog').addEventListener('click', () => {
            ui.log.innerHTML = '';
        });

        // Keyboard toggle
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
                e.preventDefault();
                rootHost.style.display = rootHost.style.display === 'none' ? '' : 'none';
            }
        });
    }

    function makeDraggable(handle, host) {
        let dx = 0, dy = 0, dragging = false, sx = 0, sy = 0, startRight, startBottom;
        const onDown = (e) => {
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            // compute current offset from right/bottom
            startRight = parseFloat(host.style.right || '14');
            startBottom = parseFloat(host.style.bottom || '14');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
        const onMove = (e) => {
            if (!dragging) return;
            dx = e.clientX - sx;
            dy = e.clientY - sy;
            host.style.right = `${Math.max(0, startRight - dx)}px`;
            host.style.bottom = `${Math.max(0, startBottom + dy)}px`;
        };
        const onUp = () => {
            dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        handle.addEventListener('mousedown', onDown);
    }

    function setBusy(b) {
        ui.status.textContent = b ? 'Thinking…' : 'Idle';
    }
    function setTurns(n) {
        ui.status.textContent = (STATE.busy ? 'Thinking…' : 'Idle') + ` • Turns: ${n}/${STATE.maxTurns}`;
    }

    function addLog(role, content) {
        if (!ui.log) return;
        const line = document.createElement('div');
        line.className = 'line';
        const tag = document.createElement('span');
        tag.className = `tag ${role}`;
        tag.textContent = role.toUpperCase();
        const body = document.createElement('span');
        body.textContent = ' ' + clip(content, 1500);
        line.appendChild(tag);
        line.appendChild(body);
        ui.log.appendChild(line);
        ui.log.scrollTop = ui.log.scrollHeight;
    }

    function addApprovalChip(text) {
        const wrap = document.createElement('div');
        wrap.className = 'chip';
        wrap.innerHTML = `
      <div class="small muted">Pending approval</div>
      <div class="small" style="white-space:pre-wrap">${escapeHTML(text)}</div>
      <div class="actions">
        <button class="btn primary" data-act="send">Send</button>
        <button class="btn" data-act="discard">Discard</button>
      </div>
    `;
        const onClick = async (e) => {
            const act = e.target?.getAttribute?.('data-act');
            if (!act) return;
            if (act === 'send') {
                try { await injectReply(text); } catch (err) { addLog('error', `Send failed: ${String(err.message || err)}`); }
            }
            wrap.remove();
            ui.approveList.removeEventListener('click', onClick);
        };
        ui.approveList.addEventListener('click', onClick);
        ui.approveList.appendChild(wrap);
    }

    function escapeHTML(s) {
        return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /**********************
     * INIT
     **********************/
    async function initState() {
        const stored = await storage.get(Object.keys(DEFAULTS));
        STATE.key = stored.OPENAI_KEY ?? DEFAULTS.OPENAI_KEY;
        STATE.model = stored.OPENAI_MODEL ?? DEFAULTS.OPENAI_MODEL;
        STATE.enabled = stored.L2R_ENABLED ?? DEFAULTS.L2R_ENABLED;
        STATE.approve = stored.L2R_APPROVE ?? DEFAULTS.L2R_APPROVE;
        STATE.maxTurns = stored.L2R_MAX_TURNS ?? DEFAULTS.L2R_MAX_TURNS;
        STATE.systemPrompt = stored.L2R_SYSTEM_PROMPT ?? DEFA
        // NEW: restore history & turns
        const restored = await storage.get([HISTORY_STORE_KEY, TURNS_STORE_KEY]);
        STATE.history = Array.isArray(restored[HISTORY_STORE_KEY]) ? restored[HISTORY_STORE_KEY] : [];
        STATE.turns = Number(restored[TURNS_STORE_KEY] || 0);
    }

    function populateUI() {
        ui.key.value = STATE.key;
        ui.model.value = ['gpt-4o-mini', 'gpt-4o', 'o4-mini'].includes(STATE.model) ? STATE.model : '__custom__';
        if (ui.model.value === '__custom__') {
            ui.modelCustom.style.display = '';
            ui.modelCustom.value = STATE.model;
        }
        ui.enabled.checked = STATE.enabled;
        ui.approve.checked = STATE.approve;
        ui.maxTurns.value = String(STATE.maxTurns);
        ui.system.value = STATE.systemPrompt;
        setTurns(STATE.turns);
    }

    async function main() {
        injectPanel();
        await initState();
        populateUI();
        observeChat();
        log('panel ready');
    }

    // Run once
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main, { once: true });
    } else {
        main();
    }
})();
