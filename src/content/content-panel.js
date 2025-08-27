/* eslint-disable no-undef */
import { initState, STATE } from '../core/state.js';
import { createBus } from '../core/bus.js';
//import { makeDraggable } from '../core/util.js';
import { NavTabs } from '../ui/NavTabs.js';
import { SettingsTab } from '../tabs/SettingsTab.js';
import { LinkingTab } from '../tabs/LinkingTab.js';
import { ImageLabTab } from '../tabs/ImageLabTab.js';
//import { LogsTab } from '../tabs/LogsTab.js';
import { TimedActionsTab } from '../tabs/TimedActionsTab.js';
import { observeChat } from '../core/replika-dom.js';
import { installChessOverlay } from './components/ChessOverlay.js';
import { installLogDock } from './components/Logging.js';


const PANEL_CSS = `

:host,*{box-sizing:border-box}

.card{
  display:block;
  width:100%;
  height:100%;              /* <-- fill the fixed host */
  background:#111827F2;
  color:white;
  border:1px solid #1f2937;
  border-radius:12px;
  box-shadow:0 10px 30px rgba(0,0,0,.35);
  overflow:hidden;
}

#l2rSystem {
  height:540px;
  font-family:monospace;
  font-size:12px;
  color:#e5e7eb;
  background:#0f172a;
  border:1px solid #273248;
  border-radius:8px;
  padding:8px;
}

#l2rImgStyle {
  width:100%;
  height:190px;
  font-family:monospace;
  font-size:12px;
  color:#e5e7eb;
  background:#0f172a;
  border:1px solid #273248;
  border-radius:8px;
  padding:8px;
}

.hdr{
  display:flex;align-items:center;gap:8px;
  padding:10px 12px;
  background:#0b1220;border-bottom:1px solid #1f2937;
  /* lock header height so math stays stable */
  min-height:42px; height:42px;
}
.hdr h3{margin:0;font-size:14px;font-weight:600;letter-spacing:.2px}
.hdr .pill{margin-left:auto;font-size:10px;opacity:.8;background:#1f2937;padding:3px 6px;border-radius:999px}

.body{
  /* Body fills the rest of the card */
  height:calc(100% - 42px);
  padding:10px 12px;
  display:flex;             /* so the inner tabs wrapper can fill */
  flex-direction:column;
  gap:10px;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  overflow:hidden;          /* prevent body from growing the panel */
}

.row{display:grid;gap:6px}
.hrow{}
.row-inline{display:flex;gap:8px}
input,select,textarea,button{font:12px system-ui;background:#0f172a;border:1px solid #273248;border-radius:8px;padding:7px 8px;color:#e5e7eb}
input::placeholder,textarea::placeholder{color:#64748b}
input:focus,select:focus,textarea:focus{outline:1px solid #3b82f6;border-color:#3b82f6}
.log{background:#0a0f1f;border:1px dashed #273248;border-radius:8px;padding:8px;height:180px;overflow:auto;color:#e5e7eb;font-size:12px;line-height:1.35}
.line{margin-bottom:6px;white-space:pre-wrap}
.tag{display:inline-block;min-width:60px;font-size:11px;opacity:.85}
.tag.replika{color:#10b981}.tag.openai{color:#60a5fa}.tag.info{color:#9ca3af}.tag.error{color:#f87171}.tag.warn{color:#f59e0b}
.chip{border:1px solid #334155;background:#0b1326;border-radius:8px;padding:6px;margin-top:6px}
.chip .actions{display:flex;gap:6px;margin-top:6px}
.small{font-size:11px;opacity:.8}
.btn{cursor:pointer}.btn.primary{background:#1d4ed8;border-color:#1d4ed8}.btn:disabled{opacity:.5;cursor:not-allowed}

/* Tabs: fixed bar + fixed/filled panel */
.l2r-tabs-wrap{
  display:flex;
  flex-direction:column;
  height:100%;              /* fill the .body area */
  min-height:0;             /* allow flex child to shrink */
}
.l2r-tabs{
  display:flex;gap:6px;margin-bottom:8px;
  flex:0 0 34px;            /* fixed-height tab bar */
  overflow:hidden;          /* keep bar from growing */
}
.l2r-tab{padding:6px 10px;border:1px solid #273248;border-radius:999px;background:#0f172a}
.l2r-tab.active{background:#1f2937}
.l2r-tabpanel{
  flex:1 1 auto;            /* fills remaining space */
  min-height:0;             /* required so it can shrink */
  overflow:auto;            /* scroll INSIDE the tab panel */
  border:1px solid #273248;
  border-radius:8px;
  padding:8px;
  background:#0a0f1f;
}

/* Gallery stays inside the tabpanel; no fixed global heights */
.l2r-gallery{
  margin-top:8px;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(210px,1fr));
  gap:8px;overflow:auto;padding:2px;
  border:1px solid #273248;border-radius:8px;background:#0a0f1f;
  max-height: 200px; height: 200px; /* fixed height for gallery */
}
.l2r-card{display:flex;flex-direction:column;gap:4px;border:1px solid #273248;border-radius:8px;padding:6px;background:#0b1326}
.l2r-card img{width:100%;height:auto;display:block;border-radius:6px}
.l2r-actions{display:flex;gap:6px}

`;

(function main() {
  let rootHost, shadow, bodyEl;

  const bus = createBus();

  function injectPanel() {
    if (rootHost) return;

    rootHost = document.createElement('div');
    rootHost.id = '__l2r_panel_host';
    rootHost.style.all = 'initial';
    rootHost.style.position = 'fixed';
    rootHost.style.zIndex = '999999';

    rootHost.style.right = '14px';
    rootHost.style.bottom = '14px';

    rootHost.style.width = '380px';
    rootHost.style.height = '900px';

    document.documentElement.appendChild(rootHost);

    shadow = rootHost.attachShadow({ mode: 'open' });

    // ✅ Inline styles directly into the shadow root (no CSP headaches)
    const styleEl = document.createElement('style');
    styleEl.textContent = PANEL_CSS;
    shadow.appendChild(styleEl);

    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <div class="hdr" id="l2rDragBar">
        <h3>Replika Link</h3>
        <span class="pill" id="l2rStatus">Idle</span>
      </div>
      <div class="body"></div>
    `;
    shadow.appendChild(wrap);
    bodyEl = wrap.querySelector('.body');
    //makeDraggable(wrap.querySelector('#l2rDragBar'), rootHost);

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        rootHost.style.display = rootHost.style.display === 'none' ? '' : 'none';
      }
    });

    const statusEl = wrap.querySelector('#l2rStatus');
    bus.on('busy', (b) => {
      statusEl.textContent = b ? 'Thinking…' : `Idle • Turns: ${STATE.turns}/${STATE.maxTurns}`;
    });
  }

  function mountTabs() {
    const tabs = [
      { id: 'link', title: 'Link', render: () => LinkingTab({ bus }) },
      { id: 'images', title: 'Images', render: () => ImageLabTab({ bus }) },
      //{ id: 'logs', title: 'Logs', render: () => LogsTab({ bus }) },
      { id: 'settings', title: 'Settings', render: () => SettingsTab({ bus }) },
      { id: 'timers', title: 'Timed Actions', render: () => TimedActionsTab({ bus }) },
    ];
    const tabsView = NavTabs({ tabs, onChange: () => { }, activeId: 'link' });
    bodyEl.appendChild(tabsView);
  }

  async function start() {
    injectPanel();
    installLogDock(bus);
    installChessOverlay(bus);
    await initState();
    mountTabs();
    observeChat({
      /* 
            onIncoming: (_text) => {
              bus.emit('log', { tag: 'replika', text: _text });
              bus.emit('incoming');
            } 
      */
      onIncoming: (text) => {
        bus.emit('log', { tag: 'replika', text });
        bus.emit('chat:text', text); // <-- board listens for this
        bus.emit('incoming');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
