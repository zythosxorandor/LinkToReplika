/* eslint-disable no-unused-vars */
import { STATE } from './state.js';

const REPLY_CHAR_LIMIT = 2048 * 10;

export function tokensForCharLimit(chars = REPLY_CHAR_LIMIT) {
  const approx = Math.floor(chars / 3.8); //// ≈ 526 for 2000 chars
  return Math.max(64, Math.min(4096, approx));
}

export async function chatComplete({ messages, temperature = 0.7, charLimit = REPLY_CHAR_LIMIT }) {
  if (!STATE.openaiKey) throw new Error('OpenAI key missing (set it in the panel)');
  const model = STATE.model || 'gpt-4o-mini';
  //const max_tokens = tokensForCharLimit(charLimit);

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STATE.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const raw = (json?.choices?.[0]?.message?.content || '').trim();
  //// hard-clip to guarantee Replika-safe length:
  return raw;
}

export function transcriptFromHistory(n = 12) {
  const recent = (STATE.history || []).slice(-n);
  return recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
}

export async function promptFromChatWithStyle() {
  const convo = transcriptFromHistory(16);
  const sys = `You are an expert prompt-writer for DALL-E style image models.
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


/**
 * Try to extract a single chess move from free text.
 * @param {{ text: string, fen: string, side: 'white'|'black' }} args
 * @returns {Promise<null | { move: string, notation: 'san'|'uci' }>}
 */
export async function extractChessMove({ text, fen, side }) {
  const sys =
    `You are a chess move parser. Given a chat message and the current position (FEN), ` +
    `determine if the message contains a legal move for the side to move: (${side}). You are allowed to determine and return a valid/correct from the text if one can be determined.` +
    `If a valid move is found, output STRICT JSON with keys: move (string), notation ("san" or "uci"). ` +
    `If no clear single legal move, output STRICT JSON: {"move": "", "notation":"san"}. No prose.`;

  const usr =
    `FEN: ${fen}\n` +
    `Side to move: ${side}\n` +
    `Message:\n${text}\n` +
    `Rules:\n- If the message is ambiguous, illegal, or not a move, return {"move":"","notation":"san"}.\n` +
    `- IF you can determine a valid move from the message then return the correct notation even if the message was not exactly correct.\n` +
    `- Prefer SAN if present ("Nf3", "exd5", "O-O"), otherwise use UCI ("e2e4").\n` +
    `Output JSON ONLY.`;

  const raw = await chatComplete({
    messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
    temperature: 0,
    charLimit: 200,
  });
  try {
    const j = JSON.parse(raw);
    if (!j || !j.move || typeof j.move !== 'string') return null;
    const notation = j.notation === 'uci' ? 'uci' : 'san';
    return j.move.trim() ? { move: j.move.trim(), notation } : null;
  } catch {
    return null;
  }
}



