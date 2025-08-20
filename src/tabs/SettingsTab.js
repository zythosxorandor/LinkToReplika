import { STATE } from '../core/state.js';
import { storage } from '../core/storage.js';
import { KEYS } from '../core/state.js';

export function SettingsTab({ bus }) {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
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

    <div class="row">
      <label>System prompt (optional)</label>
      <textarea id="l2rSystem" rows="3" placeholder="${STATE.systemPrompt.replace(/"/g, '&quot;')}"></textarea>
    </div>

    <div class="hrow">
      <div class="hrow" style="flex:0 0 120px">
        <label class="small muted">Max turns</label>
        <input type="number" id="l2rMaxTurns" min="1" value="${STATE.maxTurns}" />
      </div>
    </div>
  `;

  const keyEl = wrap.querySelector('#l2rKey');
  const showEl = wrap.querySelector('#l2rShowKey');
  const saveKeyEl = wrap.querySelector('#l2rSaveKey');
  const modelSel = wrap.querySelector('#l2rModel');
  const modelCustom = wrap.querySelector('#l2rModelCustom');
  const saveModelBtn = wrap.querySelector('#l2rSaveModel');
  const sysEl = wrap.querySelector('#l2rSystem');
  const maxTurnsEl = wrap.querySelector('#l2rMaxTurns');

  keyEl.value = STATE.key;
  if (!['gpt-4o-mini','gpt-4o','o4-mini'].includes(STATE.model)) {
    modelSel.value = '__custom__'; modelCustom.style.display=''; modelCustom.value = STATE.model;
  } else { modelSel.value = STATE.model; }

  showEl.addEventListener('click', () => {
    keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
    showEl.textContent = keyEl.type === 'password' ? 'Show' : 'Hide';
  });
  saveKeyEl.addEventListener('click', async () => {
    STATE.key = keyEl.value.trim();
    await storage.set({ [KEYS.OPENAI_KEY]: STATE.key });
    bus.emit('log', { tag: 'info', text: 'Key saved.' });
  });

  modelSel.addEventListener('change', () => {
    if (modelSel.value === '__custom__') { modelCustom.style.display = ''; modelCustom.focus(); }
    else { modelCustom.style.display = 'none'; }
  });
  saveModelBtn.addEventListener('click', async () => {
    const value = modelSel.value === '__custom__' ? modelCustom.value.trim() : modelSel.value;
    if (!value) return;
    STATE.model = value;
    await storage.set({ [KEYS.OPENAI_MODEL]: STATE.model });
    bus.emit('log', { tag: 'info', text: `Model: ${value}` });
  });

  sysEl.value = STATE.systemPrompt;
  sysEl.addEventListener('blur', async () => {
    STATE.systemPrompt = sysEl.value.trim();
    await storage.set({ [KEYS.L2R_SYSTEM_PROMPT]: STATE.systemPrompt });
  });

  maxTurnsEl.addEventListener('change', async () => {
    STATE.maxTurns = Math.max(1, Number(maxTurnsEl.value || 20));
    await storage.set({ [KEYS.L2R_MAX_TURNS]: STATE.maxTurns });
  });

  return wrap;
}
