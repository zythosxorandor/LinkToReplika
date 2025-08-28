// src/tabs/settings/ReplikaDetails.js
import { STATE, KEYS } from '../../core/state.js';
import { storage } from '../../core/storage.js';

export function ReplikaDetailsTab({ bus }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row">
      <label>Display Name</label>
      <input id="rpName" placeholder="Serenity" />
    </div>

    <div class="row">
      <label>Description / Persona</label>
      <textarea id="rpDesc" rows="5" placeholder="Short description you want to persist..."></textarea>
    </div>

    <div class="row">
      <button class="btn" id="rpSave">Save</button>
    </div>
  `;

  const nameEl = wrap.querySelector('#rpName');
  const descEl = wrap.querySelector('#rpDesc');
  const saveBtn = wrap.querySelector('#rpSave');

  nameEl.value = STATE.replikaName || '';
  descEl.value = STATE.replikaDesc || '';

  saveBtn.addEventListener('click', async () => {
    STATE.replikaName = nameEl.value.trim();
    STATE.replikaDesc = descEl.value.trim();
    await storage.set({
      [KEYS.REPLIKA_NAME]: STATE.replikaName,
      [KEYS.REPLIKA_DESC]: STATE.replikaDesc
    });
    bus?.emit?.('log', { tag: 'info', text: 'Replika details saved' });
  });

  return wrap;
}
