import { STATE, saveHistory } from '../core/state.js';
import { chatComplete, REPLY_CHAR_LIMIT } from '../core/openai.js';
import { injectReply } from '../core/replika-dom.js';
import { storage } from '../core/storage.js';
import { KEYS } from '../core/state.js';

export function LinkingTab({ bus }) {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <div class="hrow">
      <div>Open AI: <span class="pill" id="l2rStatus">Idle</span></div>
      <br />
      <label class="toggle">
        <input type="checkbox" id="l2rEnabled" />
        <span>Link OpenAI ↔ Replika</span>
      </label>
      <br />
      <label class="toggle">
        <input type="checkbox" id="l2rApprove" />
        <span>Approve before sending</span>
      </label>
    </div>

    <div class="row">
      <label>Manual send</label>
      <div class="row-inline">
        <input id="l2rManual" placeholder="Type and inject into Replika" />
        <button class="btn" id="l2rManualSend">Send</button>
      </div>
    </div>
  `;

  const enabledEl = wrap.querySelector('#l2rEnabled');
  const approveEl = wrap.querySelector('#l2rApprove');
  const statusEl = wrap.querySelector('#l2rStatus');
  const manualEl = wrap.querySelector('#l2rManual');
  const manualSendEl = wrap.querySelector('#l2rManualSend');

  enabledEl.checked = STATE.enabled;
  approveEl.checked = STATE.approve;

  enabledEl.addEventListener('change', async () => {
    STATE.enabled = enabledEl.checked;
    await storage.set({ [KEYS.L2R_ENABLED]: STATE.enabled });
    bus.emit('log', { tag: 'info', text: STATE.enabled ? 'Linking enabled' : 'Linking disabled' });
  });
  approveEl.addEventListener('change', async () => {
    STATE.approve = approveEl.checked;
    await storage.set({ [KEYS.L2R_APPROVE]: STATE.approve });
  });

  manualSendEl.addEventListener('click', async () => {
    try {
      const txt = manualEl.value.trim();
      if (!txt) return;
      await injectReply(txt);
      manualEl.value = '';
    } catch (e) {
      bus.emit('log', { tag: 'error', text: `Manual send failed: ${String(e.message || e)}` });
    }
  });

  // status updates
  bus.on('busy', (b) => {
    statusEl.textContent = b ? 'Thinking…' : `Idle • Turns: ${STATE.turns}/${STATE.maxTurns}`;
  });

  // main link hook (called by content-panel observe)
  bus.on('incoming', async () => {
    if (!STATE.enabled || STATE.busy) return;
    if (STATE.turns >= STATE.maxTurns) { bus.emit('log', { tag: 'info', text: 'Max turns reached.' }); return; }
    if (!STATE.key) { bus.emit('log', { tag: 'error', text: 'No OpenAI key set.' }); return; }

    STATE.busy = true; bus.emit('busy', true);
    try {
      const msgs = [
        ...(STATE.systemPrompt ? [{ role: 'system', content: STATE.systemPrompt }] : []),
        ...STATE.history.slice(-16),
      ];
      const reply = await chatComplete({ messages: msgs, temperature: 0.7, charLimit: REPLY_CHAR_LIMIT });
      STATE.history.push({ role: 'assistant', content: reply });
      STATE.turns += 1;
      await saveHistory();
      //bus.emit('log', { tag: 'openai', text: reply });

      if (STATE.approve) {
        bus.emit('approval:add', reply);
      } else {
        await injectReply(reply);
      }
    } catch (e) {
      bus.emit('log', { tag: 'error', text: String(e.message || e) });
    } finally {
      STATE.busy = false; bus.emit('busy', false);
    }
  });

  return wrap;
}
