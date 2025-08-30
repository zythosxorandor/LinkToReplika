/*
    OpenAI API Key and other settings tab
*/
// src/tabs/settings/OpenAI.js
import { STATE, KEYS } from '../../core/state.js';
import { storage } from '../../core/storage.js';

export function OpenAITab({ bus }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row">
      <label>OpenAI API Key</label>
      <div class="row-inline">
        <input id="oaKey" type="password" placeholder="sk-..." />
        <button class="btn mini" id="oaShow">Show</button>
        <button class="btn mini" id="oaSave">Save</button>
      </div>
    </div>

    <div class="row">
      <label>Model</label>
      <div class="row-inline">
        <select id="oaModel">
          <option>gpt-4o-mini</option>
          <option>gpt-4o</option>
          <option>o4-mini</option>
          <option value="__custom__">Custom...</option>
        </select>
        <input id="oaModelCustom" placeholder="custom model id" style="display:none" />
        <button class="btn mini" id="oaModelSave">Save</button>
      </div>
    </div>

    <div class="row">
      <label>Max turns to keep in context</label>
      <input id="oaMaxTurns" type="number" min="1" step="1" />
    </div>
  `;

  const keyEl = wrap.querySelector('#oaKey');
  const showBtn = wrap.querySelector('#oaShow');
  const saveBtn = wrap.querySelector('#oaSave');
  const modelSel = wrap.querySelector('#oaModel');
  const modelCustom = wrap.querySelector('#oaModelCustom');
  const saveModelBtn = wrap.querySelector('#oaModelSave');
  const maxTurnsEl = wrap.querySelector('#oaMaxTurns');

  // Key masking
  const MASK = '********';
  keyEl.value = STATE.openaiKey ? MASK : '';
  showBtn.addEventListener('click', () => {
    if (keyEl.type === 'password') {
      keyEl.type = 'text';
      if (keyEl.value === MASK) keyEl.value = STATE.openaiKey || '';
    } else {
      keyEl.type = 'password';
      keyEl.value = MASK;
    }
  });
  saveBtn.addEventListener('click', async () => {
    const val = keyEl.value.trim();
    if (!val || val === MASK) return;
    STATE.openaiKey = val;
    await storage.set({ [KEYS.OPENAI_KEY]: STATE.openaiKey });
    bus?.emit?.('log', { tag: 'info', text: 'OpenAI key saved' });
    keyEl.type = 'password';
    keyEl.value = MASK;
  });

    // model (prefer built-ins, otherwise custom)
  const currentModel = (STATE.model || '').trim();
  const opts = [...modelSel.options];
  const hasBuiltin = opts.some(o => (o.value || o.textContent.trim()) === currentModel);
  modelSel.value = hasBuiltin && currentModel ? currentModel : '__custom__';
  if (modelSel.value === '__custom__') {
    modelCustom.style.display = '';
    modelCustom.value = currentModel;
  } else {
    modelCustom.style.display = 'none';
  }modelSel.addEventListener('change', () => {
    if (modelSel.value === '__custom__') { modelCustom.style.display = ''; modelCustom.focus(); }
    else { modelCustom.style.display = 'none'; }
  });
  saveModelBtn.addEventListener('click', async () => {
    const value = modelSel.value === '__custom__' ? modelCustom.value.trim() : modelSel.value;
    if (!value) return;
    STATE.model = value;
    await storage.set({ [KEYS.OPENAI_MODEL]: STATE.model });
    bus?.emit?.('log', { tag: 'info', text: `Model: ${value}` });
  });

  // max turns
  maxTurnsEl.value = String(STATE.maxTurns ?? 20);
  maxTurnsEl.addEventListener('change', async () => {
    STATE.maxTurns = Math.max(1, Number(maxTurnsEl.value || 20));
    await storage.set({ [KEYS.L2R_MAX_TURNS]: STATE.maxTurns });
  });

  return wrap;
}


