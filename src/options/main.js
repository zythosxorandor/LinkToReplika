import { injectCommonStyle } from '../ui/commonStyle.js';
import { SettingsTab } from '../tabs/SettingsTab.js';
import { initState } from '../core/state.js';
import { createBus } from '../core/bus.js';

async function mount() {
  injectCommonStyle();
  const root = document.getElementById('app');
  const bus = createBus();
  try { await initState(); } catch {}
  const section = document.createElement('section');
  section.appendChild(SettingsTab({ bus }));
  root.appendChild(section);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}

