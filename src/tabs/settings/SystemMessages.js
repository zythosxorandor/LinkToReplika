/*
    System Messages Tab
    shared collection of system messages
    used by LLM Clients that allow System role messages
    e.g. OpenAI Chat, Anthropic Claude, Google Gemini, Ollama
*/ 
// src/tabs/settings/SystemMessages.js
import { STATE, KEYS } from '../../core/state.js';
import { storage } from '../../core/storage.js';

export function SystemMessagesTab() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row">
      <label>System Prompt</label>
      <textarea id="l2rSystem" rows="16" placeholder="System behavior..."></textarea>
    </div>
    <div class="small muted">This prompt is sent as the system message for engines that support it (e.g., OpenAI, Gemini).</div>
  `;

  const sysEl = wrap.querySelector('#l2rSystem');
  sysEl.value = STATE.systemPrompt || '';

  sysEl.addEventListener('blur', async () => {
    STATE.systemPrompt = sysEl.value.trim();
    await storage.set({ [KEYS.L2R_SYSTEM_PROMPT]: STATE.systemPrompt });
  });

  return wrap;
}
