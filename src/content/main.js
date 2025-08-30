import { initState } from '../core/state.js';
import { createBus } from '../core/bus.js';
import { observeChat } from '../core/replika-dom.js';
import { installChessOverlay } from './components/ChessOverlay.js';
import { installLogDock } from './components/Logging.js';
import { installLinkPanel } from './components/LinkPanel.js';
import { injectCommonStyle } from "../ui/commonStyle.js";

(function main() {
  const bus = createBus();

  


  async function start() {

    injectCommonStyle();

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



