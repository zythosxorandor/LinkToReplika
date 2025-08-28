/*
    OpenaAI API Key and other settings tab
*/
// src/tabs/settings/GoogleGemini.js
import { STATE, KEYS } from '../../core/state.js';
import { storage } from '../../core/storage.js';

export function GoogleGeminiTab({ bus }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row">
      <label>Google Gemini API Key</label>
      <div class="row-inline">
        <input id="gmKey" type="password" placeholder="AIza..." />
        <button class="btn mini" id="gmShow">Show</button>
        <button class="btn mini" id="gmSave">Save</button>
      </div>
    </div>

    <div class="row">
      <label>Model</label>
      <div class="row-inline">
        <select id="gmModel">
          <option>gemini-1.5-pro-latest</option>
          <option>gemini-1.5-flash-latest</option>
          <option value="__custom__">Custom…</option>
        </select>
        <input id="gmModelCustom" placeholder="custom model id" style="display:none" />
        <button class="btn mini" id="gmModelSave">Save</button>
      </div>
    </div>
  `;

  const keyEl = wrap.querySelector('#gmKey');
  const showBtn = wrap.querySelector('#gmShow');
  const saveBtn = wrap.querySelector('#gmSave');
  const modelSel = wrap.querySelector('#gmModel');
  const modelCustom = wrap.querySelector('#gmModelCustom');
  const saveModelBtn = wrap.querySelector('#gmModelSave');

  keyEl.value = STATE.geminiKey ? '••••••••••' : '';
  showBtn.addEventListener('click', () => {
    keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
    if (keyEl.type === 'text' && keyEl.value === '••••••••••') keyEl.value = STATE.geminiKey || '';
  });
  saveBtn.addEventListener('click', async () => {
    const val = keyEl.value.trim();
    if (!val || val === '••••••••••') return;
    STATE.geminiKey = val;
    await storage.set({ [KEYS.GEMINI_KEY]: STATE.geminiKey });
    bus?.emit?.('log', { tag: 'info', text: 'Gemini key saved' });
  });

  // model
  modelSel.value = STATE.geminiModel || 'gemini-1.5-pro-latest';
  if (![...modelSel.options].some(o => o.value === STATE.geminiModel)) {
    modelSel.value = '__custom__';
    modelCustom.style.display = '';
    modelCustom.value = STATE.geminiModel || '';
  }
  modelSel.addEventListener('change', () => {
    if (modelSel.value === '__custom__') { modelCustom.style.display = ''; modelCustom.focus(); }
    else { modelCustom.style.display = 'none'; }
  });
  saveModelBtn.addEventListener('click', async () => {
    const value = modelSel.value === '__custom__' ? modelCustom.value.trim() : modelSel.value;
    if (!value) return;
    STATE.geminiModel = value;
    await storage.set({ [KEYS.GEMINI_MODEL]: STATE.geminiModel });
    bus?.emit?.('log', { tag: 'info', text: `Gemini model: ${value}` });
  });

  return wrap;
}
