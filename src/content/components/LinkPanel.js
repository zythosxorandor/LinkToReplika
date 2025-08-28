/* eslint-disable no-undef */
// src/content/components/LinkPanel.js
import { STATE } from '../../core/state.js';
import { NavTabs } from '../../ui/NavTabs.js';
import { LinkingTab } from '../../tabs/LinkingTab.js';
import { ImageLabTab } from '../../tabs/ImageLabTab.js';
import { SettingsTab } from '../../tabs/SettingsTab.js';
import { TimedActionsTab } from '../../tabs/TimedActionsTab.js';

const PANEL_CSS = `
 :host,*{box-sizing:border-box}
 .card{
   display:block;width:100%;height:100%;
   background:#111827F2;color:white;border:1px solid #1f2937;
   border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);
   overflow:hidden;
 }
 .hdr{
   display:flex;align-items:center;gap:8px;
   padding:4px 2px;
   background:#0b1220;
   border-bottom:1px solid #1f2937;
   /*min-height:42px;*/
 }
 .pill{margin-left:auto;font-size:12px;opacity:.85}
 .body{ padding:8px;height:calc(100% - 64px) }
 /* Tabs */
 .l2r-tabs-wrap{display:flex;flex-direction:column;height:100%;min-height:0}
 .l2r-tabs{display:flex;gap:6px;margin-bottom:8px;flex:0 0 34px;overflow:hidden}
 .l2r-tab{padding:6px 10px;border:1px solid #273248;border-radius:999px;background:#0f172a; color: #e5e7eb;}
 .l2r-tab.active{background:#1f2937}
 .l2r-tabpanel{flex:1 1 auto;min-height:0;overflow:auto;border:1px solid #273248;border-radius:8px;padding:8px;background:#0a0f1f}
 /* Textareas used in tabs */
 #l2rSystem{height:540px;font-family:monospace;font-size:12px;color:#e5e7eb;background:#0f172a;border:1px solid #273248;border-radius:8px;padding:8px}
 #l2rImgStyle{width:100%;height:190px;font-family:monospace;font-size:12px;color:#e5e7eb;background:#0f172a;border:1px solid #273248;border-radius:8px;padding:8px}
 `;

function addPanelToggle(rootHost) {
    if (document.getElementById('__l2r_panel_toggle')) return;
    const css = document.createElement('style');
    css.id = '__l2r_panel_toggle_css';
    css.textContent = `
     #__l2r_panel_toggle{
       position:fixed;top: 202px; left: 12px;;z-index:999999;
     }
     #__l2r_panel_toggle:hover{filter:brightness(1.1)}
   `;
    document.documentElement.appendChild(css);

    const btn = document.createElement('button');
    btn.id = '__l2r_panel_toggle';
    btn.title = 'Toggle Link Panel (Ctrl+Shift+L)';
    btn.textContent = '🧩 Link';
    btn.addEventListener('click', () => {
        rootHost.style.display = rootHost.style.display === 'none' ? '' : 'none';
    });
    btn.className = 'l2r-btn';
    document.documentElement.appendChild(btn);
}

export function installLinkPanel(bus) {
    if (document.getElementById('__l2r_panel_host')) return;

    // Fixed host at bottom-right (same as before)
    const rootHost = document.createElement('div');
    rootHost.id = '__l2r_panel_host';
    rootHost.style.all = 'initial';
    rootHost.style.position = 'fixed';
    rootHost.style.zIndex = '999999';
    rootHost.style.right = '14px';
    rootHost.style.bottom = '14px';
    rootHost.style.width = '440px';      // latest width you were using
    rootHost.style.height = '900px';
    document.documentElement.appendChild(rootHost);

    const shadow = rootHost.attachShadow({ mode: 'open' });
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

    const bodyEl = wrap.querySelector('.body');
    const statusEl = wrap.querySelector('#l2rStatus');

    // Keyboard toggle (Ctrl+Shift+L) — unchanged
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
            e.preventDefault();
            rootHost.style.display = rootHost.style.display === 'none' ? '' : 'none';
        }
    });

    // Busy pill (uses STATE just like before)
    bus.on('busy', (b) => {
        statusEl.textContent = b ? 'Thinking…' : `Idle • Turns: ${STATE.turns}/${STATE.maxTurns}`;
    });

    // Tabs — same list you already had
    const tabs = [
        { id: 'link', title: 'Link', render: () => LinkingTab({ bus }) },
        { id: 'images', title: 'Images', render: () => ImageLabTab({ bus }) },
        { id: 'settings', title: 'Settings', render: () => SettingsTab({ bus }) },
        { id: 'timers', title: 'Timed Actions', render: () => TimedActionsTab({ bus }) },
    ];
    const view = NavTabs({ tabs, onChange: () => { }, activeId: 'link' });
    bodyEl.appendChild(view);

    // Small top-right toggle button (like chess / logs have theirs)
    addPanelToggle(rootHost);
}