import { STATE } from './state.js';

export const REPLY_CHAR_LIMIT = 350;

export function tokensForCharLimit(chars = REPLY_CHAR_LIMIT) {
  const approx = Math.floor(chars / 3.8); // ≈ 526 for 2000 chars
  return Math.max(64, Math.min(4096, approx));
}

export async function chatComplete({ messages, temperature = 0.7, charLimit = REPLY_CHAR_LIMIT }) {
  if (!STATE.key) throw new Error('OpenAI key missing (set it in the panel)');
  const model = STATE.model || 'gpt-4o-mini';
  const max_tokens = tokensForCharLimit(charLimit);

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STATE.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const raw = (json?.choices?.[0]?.message?.content || '').trim();
  // hard-clip to guarantee Replika-safe length:
  return raw;
}

export function transcriptFromHistory(n = 12) {
  const recent = (STATE.history || []).slice(-n);
  return recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
}

export async function promptFromChatWithStyle() {
  const convo = transcriptFromHistory(16);
  const sys = `You are an expert prompt-writer for DALL·E style image models.
Given a conversation transcript and a style recipe, produce ONE concise, vivid, concrete image prompt.
Rules:
- 1–4 sentences. <= 2500 characters total.
- Describe subject, setting, background, foreground, lighting, mood, and camera.
- Avoid copyrighted characters/logos and explicit sexual content.
- Do NOT include disclaimers or the transcript itself. Output only the prompt.`;

  const user = `Style recipe:
${STATE.imgStyle}

Conversation (recent):
${convo}

Write the single best image prompt now.`;

  const out = await chatComplete({
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.9,
    charLimit: 2500,
  });
  return out;
}
