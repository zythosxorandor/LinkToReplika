// src/tabs/settings/UserDetails.js
import { STATE, KEYS } from '../../core/state.js';
import { storage } from '../../core/storage.js';

export function UserDetailsTab({ bus }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row">
      <label>Your Display Name</label>
      <input id="udName" placeholder="You" />
    </div>

    <div class="row">
      <label>About You / Notes</label>
      <textarea id="udDesc" rows="5" placeholder="Anything useful to persist about yourself..."></textarea>
    </div>

    <div class="row">
      <button class="btn" id="udSave">Save</button>
    </div>
  `;

  const nameEl = wrap.querySelector('#udName');
  const descEl = wrap.querySelector('#udDesc');
  const saveBtn = wrap.querySelector('#udSave');

  nameEl.value = STATE.userName || '';
  descEl.value = STATE.userDesc || '';

  saveBtn.addEventListener('click', async () => {
    STATE.userName = nameEl.value.trim();
    STATE.userDesc = descEl.value.trim();
    await storage.set({
      [KEYS.USER_NAME]: STATE.userName,
      [KEYS.USER_DESC]: STATE.userDesc
    });
    bus?.emit?.('log', { tag: 'info', text: 'User details saved' });
  });

  return wrap;
}
