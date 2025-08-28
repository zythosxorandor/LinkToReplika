/* eslint-disable no-undef */
// src/core/gemini.js
import { STATE } from './state.js';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * chatComplete({ messages, temperature })
 * Matches the shape of openai.js: returns a single string.
 * Supports a top-level system message via systemInstruction when present.
 */
export async function chatComplete({ messages = [], temperature = 0.7 } = {}) {
  const apiKey = STATE.geminiKey;
  if (!apiKey) throw new Error('Missing Google Gemini API key');

  const model = STATE.geminiModel || 'gemini-1.5-pro-latest';

  // Split out a single system message if one exists
  const sys = messages.find(m => m.role === 'system');
  const userAssistantMsgs = messages.filter(m => m.role !== 'system');

  const body = {
    contents: userAssistantMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '') }]
    })),
    generationConfig: { temperature },
  };
  if (sys?.content) {
    // v1beta supports systemInstruction
    body.systemInstruction = { role: 'system', parts: [{ text: String(sys.content) }] };
  }

  const res = await fetch(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${errText || res.statusText}`);
  }

  const json = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('') ??
    json?.candidates?.[0]?.content?.parts?.[0]?.text ??
    '';

  return String(text || '').trim();
}
