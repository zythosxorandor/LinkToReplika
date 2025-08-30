import { initState } from '../core/state.js';
import { createBus } from '../core/bus.js';
import { observeChat } from '../core/replika-dom.js';
import { installChessOverlay } from './components/ChessOverlay.js';
import { installLogDock } from './components/Logging.js';
import { installLinkPanel } from './components/LinkPanel.js';

(function main() {
  const bus = createBus();
  const COMMON_STYLE = `
    .l2r-btn {
      min-width: 120px;
      min-height: 26px;
      font: 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      padding: 6px 10px; border-radius: 999px; border: 1px solid #273248;
      background: #0f172a; color: #e5e7eb; cursor: pointer; font: 12px system-ui;
      box-shadow: 0 6px 22px rgba(0,0,0,.35);
    }
    .l2r-btn:hover {
      background: #1f2937; border: 1px solid #9399a4ff;
    }
   `;

  const addCommonStyles = () => {
    if (document.getElementById('__l2r_common_css')) return;
    const css = document.createElement('style');
    css.id = '__l2r_common_css';
    css.textContent = COMMON_STYLE;
    document.documentElement.appendChild(css);
  };


  async function start() {

    addCommonStyles();

    // mount UI pieces
    installLinkPanel(bus);
    installLogDock(bus);
    installChessOverlay(bus);

    await initState();

    observeChat({
      onIncoming: (text) => {
        //bus.emit('log', { tag: 'replika', text });
        bus.emit('chat:text', text);
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

