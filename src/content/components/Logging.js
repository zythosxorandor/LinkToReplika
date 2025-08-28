/* eslint-disable no-undef */
import { escapeHTML, clip } from '../../core/util.js';
import { injectReply } from '../../core/replika-dom.js';

export function Logger({ bus }) {
    const wrap = document.createElement('section');
    wrap.innerHTML = `
    <div class="row">
      <label class="hrow">
        <span>Live log</span>
        <button class="btn mini" id="l2rClearLog">Clear</button>
      </label>
      <div class="log" id="l2rLogging"></div>
      <div id="l2rApproveList"></div>
    </div>
  `;

    const logEl = wrap.querySelector('#l2rLogging');
    const clearBtn = wrap.querySelector('#l2rClearLog');
    const approveList = wrap.querySelector('#l2rApproveList');

    clearBtn.addEventListener('click', () => { logEl.innerHTML = ''; });

    function addLogLine(tag, text) {
        const line = document.createElement('div');
        line.className = 'line';
        const pill = document.createElement('span');
        pill.className = `tag ${tag}`; pill.textContent = String(tag).toUpperCase();
        const body = document.createElement('span');
        body.innerHTML = ' ' + escapeHTML(clip(text, 4000));
        line.appendChild(pill); line.appendChild(body);
        logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight;
    }

    function addApprovalChip(text) {
        const wrapChip = document.createElement('div');
        wrapChip.className = 'chip';
        wrapChip.innerHTML = `
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
                try { await injectReply(text); } catch (err) { addLogLine('error', `Send failed: ${String(err.message || err)}`); }
            }
            wrapChip.remove();
        };
        wrapChip.addEventListener('click', onClick);
        approveList.appendChild(wrapChip);
    }

    // bus hooks
    bus.on('log', ({ tag, text }) => addLogLine(tag, text));
    bus.on('approval:add', (text) => addApprovalChip(text));

    return wrap;
}

// --- Log Dock ---
const LOG_KEY = '__l2r_logs_v1';
function timestamp() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
async function loadLogs() {
    return new Promise(res => chrome.storage?.local?.get([LOG_KEY], v => res(v[LOG_KEY] || [])));
}
async function saveLogs(arr) {
    return new Promise(res => chrome.storage?.local?.set({ [LOG_KEY]: arr.slice(-500) }, res));
}

export async function installLogDock(bus) {
    if (document.getElementById('__l2r_logdock')) return;
    const style = document.createElement('style');
    style.textContent = `
    #__l2r_logdock {
      position: fixed; right: 12px; top: 66px; width: 440px; height: 352px;
      z-index: 2147483646; background: #0b1220; border: 1px solid #1f2937; border-radius: 12px;
      display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.35);
    }
    #__l2r_logdock header {
      display:flex; align-items:center; gap:8px; padding:6px 8px; color:#e5e7eb; font: 12px system-ui;
      background:#0f172a; border-bottom:1px solid #1f2937;
    }
    #__l2r_logdock .spacer { flex:1; }
    #__l2r_logdock .body {
      flex:1; overflow:auto; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color:#cbd5e1; padding:8px;
    }
    #__l2r_logdock .row { white-space: pre-wrap; margin:0 0 6px 0; }
    #__l2r_log_toggle {
      position: fixed; left: 12px; top: 262px; z-index: 2147483646;
    }
  `;
    document.documentElement.appendChild(style);

    const toggle = document.createElement('button');
    toggle.id = '__l2r_log_toggle';
    toggle.textContent = '🪵 Logs';
    toggle.className = 'l2r-btn';
    document.documentElement.appendChild(toggle);

    const dock = document.createElement('div');
    dock.id = '__l2r_logdock';
    dock.style.display = 'none';
    dock.innerHTML = `
    <header><strong>Logs</strong><span class="spacer"></span>
      <button id="__l2r_log_clear" style="font:inherit;padding:3px 8px;border-radius:8px;border:1px solid #273248;background:#0f172a;color:#e5e7eb;cursor:pointer">Clear</button>
    </header>
    <div class="body" id="__l2r_log_body"></div>
  `;
    document.documentElement.appendChild(dock);

    const body = dock.querySelector('#__l2r_log_body');
    function render(list) {
        body.innerHTML = '';
        for (const item of list) {
            const div = document.createElement('div');
            div.className = 'row';
            div.textContent = `[${item.t}] ${item.tag}: ${item.text}`;
            body.appendChild(div);
        }
        body.scrollTop = body.scrollHeight;
    }
    const logs = await loadLogs(); render(logs);

    async function append(tag, text) {
        logs.push({ t: timestamp(), tag, text: String(text) });
        render(logs);
        await saveLogs(logs);
    }

    toggle.addEventListener('click', () => {
        dock.style.display = dock.style.display === 'none' ? '' : 'none';
    });
    dock.querySelector('#__l2r_log_clear').addEventListener('click', async () => {
        logs.length = 0; render(logs); await saveLogs(logs);
    });

    // expose simple API + listen to bus
    window.__l2r_logDock = { log: append };
    bus?.on?.('log', ({ tag = 'info', text = '' } = {}) => append(tag, text));
}
