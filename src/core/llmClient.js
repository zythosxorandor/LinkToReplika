import { STATE, KEYS } from './state.js';
import { storage } from './storage.js';
import * as openai from './openai.js';
import * as gemini from './gemini.js';

export function getActiveProvider() {
  return STATE.llmProvider || 'openai';
}

export async function setActiveProvider(p) {
  const val = (p === 'gemini') ? 'gemini' : 'openai';
  STATE.llmProvider = val;
  await storage.set({ [KEYS.L2R_LLM_PROVIDER]: STATE.llmProvider });
}

export async function chatCompleteLLM({ messages, temperature = 0.7, charLimit }) {
  const prov = getActiveProvider();
  if (prov === 'gemini') {
    return gemini.chatComplete({ messages, temperature });
  }
  return openai.chatComplete({ messages, temperature, charLimit });
}

export function transcriptFromHistory(n = 12) {
  const recent = (STATE.history || []).slice(-n);
  return recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
}

export async function promptFromChatWithStyleLLM() {
  const convo = transcriptFromHistory(16);
  const sys = `You are an expert prompt-writer for image models.
Given a conversation transcript and a style recipe, produce ONE concise, vivid, concrete image prompt.
Rules:
- 1-4 sentences. <= 2500 characters total.
- Describe subject, setting, background, foreground, lighting, mood, and camera.
- Avoid copyrighted characters/logos and explicit sexual content.
- Do NOT include disclaimers or the transcript itself. Output only the prompt.`;
  const user = `Style recipe:\n${STATE.imgStyle}\n\nConversation (recent):\n${convo}\n\nWrite the single best image prompt now.`;
  return chatCompleteLLM({
    messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ],
    temperature: 0.9,
    charLimit: 2500,
  });
}
