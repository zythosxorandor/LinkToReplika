import { injectCommonStyle } from '../ui/commonStyle.js';
import { NavTabs } from '../ui/NavTabs.js';
import { SettingsTab } from '../tabs/SettingsTab.js';
import { createBus } from '../core/bus.js';
import { initState } from '../core/state.js';

const LOG_KEY = '__l2r_logs_v1';

function AboutTab() {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <div class="row">
      <h3 style="margin:0">LinkToReplika</h3>
      <div class="small muted">
        A lightweight control layer that links your Replika web chat with modern LLMs.
        It watches incoming messages, builds a privacy-respecting context, and can inject
        replies automatically or with your approval. Extras include an Image Lab and a
        chess overlay that understands chat moves.
      </div>
      <div class="small muted">
        Security note: API keys are stored locally via chrome.storage. Consider a proxy
        if you prefer not to store keys in the browser environment.
      </div>
    </div>`;
  return wrap;
}

async function loadLogs() {
  return new Promise(res => chrome.storage?.local?.get([LOG_KEY], v => res(v[LOG_KEY] || [])));
}
async function saveLogs(arr) {
  return new Promise(res => chrome.storage?.local?.set({ [LOG_KEY]: arr.slice(-500) }, res));
}
function LogsTab() {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <div class="row">
      <div class="hrow">
        <strong>Logs</strong>
        <span class="small muted" style="margin-left:auto">Persisted from log dock</span>
        <button class="btn mini" id="lgClear">Clear</button>
      </div>
      <div class="log" id="lgBody"></div>
    </div>`;
  const body = wrap.querySelector('#lgBody');
  const clear = wrap.querySelector('#lgClear');
  function render(list){
    body.innerHTML = '';
    for (const it of list) {
      const row = document.createElement('div');
      row.className = 'row';
      row.textContent = `[${it.t}] ${it.tag}: ${it.text}`;
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;
  }
  (async () => { render(await loadLogs()); })();
  clear.addEventListener('click', async () => { await saveLogs([]); render([]); });
  return wrap;
}

async function mount() {
  injectCommonStyle();
  const root = document.getElementById('app');
  const bus = createBus();
  try { await initState(); } catch {}
  const tabs = [
    { id: 'about', title: 'About', render: () => AboutTab() },
    { id: 'logs',  title: 'Logs',  render: () => LogsTab() },
    { id: 'settings', title: 'Settings', render: () => SettingsTab({ bus }) },
  ];
  const view = NavTabs({ tabs, activeId: 'about' });
  root.appendChild(view);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}



