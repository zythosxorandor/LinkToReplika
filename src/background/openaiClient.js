/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
// openaiClient.js
// A minimal, dependency-free OpenAI client using fetch. Works in browsers & MV3 service workers.

// ---------------------------
// Types (JSDoc for IntelliSense)
// ---------------------------
/**
 * @typedef {'system'|'user'|'assistant'} ChatRole
 * @typedef {{ role: ChatRole, content: string, timestamp?: number }} ChatMessage
 * @typedef {{
 *   model?: string,
 *   apiKey?: string,                  // If omitted, provide via getApiKey()
 *   maxTokens?: number,
 *   temperature?: number,
 *   topP?: number,
 *   presencePenalty?: number,
 *   frequencyPenalty?: number,
 *   loggingEnabled?: boolean,
 *   baseUrl?: string                  // Override for proxies: default 'https://api.openai.com'
 * }} LLMClientConfiguration
 */

// ---------------------------
// Utilities
// ---------------------------
const DEFAULTS = {
  model: 'gpt-4o-mini',
  maxTokens: 1024,
  temperature: 0.7,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  baseUrl: 'https://api.openai.com',
  loggingEnabled: false,
};

/** Sleep helper */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Basic exponential backoff (used on 429/5xx) */
async function backoffRetry(fn, { retries = 3, base = 300 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const wait = base * 2 ** (attempt - 1) + Math.random() * 100;
      await sleep(wait);
    }
  }
}
async function getModel(cfg) {
  // Use stored model if present; otherwise fall back to cfg.model
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const { OPENAI_MODEL } = await new Promise((resolve) =>
        chrome.storage.local.get(['OPENAI_MODEL'], resolve)
      );
      return OPENAI_MODEL || cfg.model || 'gpt-4o-mini';
    }
  } catch (_) { console.log('Failed to read OPENAI_MODEL from storage'); }
  return cfg.model || 'gpt-4o-mini';
}

/** Ensure we have an API key. In MV3 you might store it in chrome.storage. */
async function getApiKey(cfg) {
  if (cfg.apiKey) return cfg.apiKey;

  // Try chrome.storage if present
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    const { OPENAI_KEY } = await chrome.storage.local.get('OPENAI_KEY');
    if (OPENAI_KEY) return OPENAI_KEY;
  }

  // Environment variables don't exist in MV3; fall back to a global if you set window.OPENAI_KEY.
  if (typeof window !== 'undefined' && window.OPENAI_KEY) return window.OPENAI_KEY;

  throw new Error('OpenAI API key not found. Provide in config.apiKey or chrome.storage.local[OPENAI_KEY].');
}

/** Safe JSON parse */
function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** Build common headers */
async function buildHeaders(cfg) {
  const key = await getApiKey(cfg);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
  };
}

/** Convert ArrayBuffer to base64 (browser-safe) */
function arrayBufferToBase64(ab) {
  let binary = '';
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Convert Blob/File to base64 data URL (for vision-bytes) */
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

/** Quick hash for dedupe (optional) */
async function sha1(input) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------
// Message History (like your C# ChatMessageHistory)
// ---------------------------
export class ChatMessageHistory {
  constructor() {
    /** @type {ChatMessage[]} */
    this.messages = [];
  }

  /** @param {ChatMessage} msg */
  addMessage(msg) {
    this.messages.push({ ...msg, timestamp: msg.timestamp ?? Date.now() });
  }

  /** Returns a snapshot including a trailing userMessage (if provided) */
  getConversationSnapShot(userMessage) {
    const snapshot = [...this.messages];
    if (userMessage) snapshot.push({ role: 'user', content: userMessage, timestamp: Date.now() });
    return snapshot;
  }

  clear() { this.messages = []; }
}

// ---------------------------
// Base client (similar to ClientBase)
// ---------------------------
export class ClientBase {
  /** @param {LLMClientConfiguration} config @param {ChatMessageHistory} messageHistory */
  constructor(config, messageHistory) {
    /** @type {Required<LLMClientConfiguration>} */
    this.config = { ...DEFAULTS, ...config };
    this.messageHistory = messageHistory ?? new ChatMessageHistory();
  }

  log(...args) { if (this.config.loggingEnabled) console.debug('[OpenAI]', ...args); }
}

// ---------------------------
// OpenAI Chat Client (chat/completions)
// ---------------------------
export class OpenAIChatClient extends ClientBase {
  constructor(config = {}, messageHistory = new ChatMessageHistory()) {
    super(config, messageHistory);
    // Align with your C# default
    this.config.model = this.config.model || 'gpt-4o-mini';
  }

  /** Map ChatMessageHistory -> OpenAI format */
  toOpenAIFormat(userMessage) {
    const msgs = this.messageHistory.getConversationSnapShot(userMessage);
    // Your C# maps "llm" -> "assistant"; here ensure roles are valid
    return msgs.map(m => ({
      role: (m.role === 'assistant' || m.role === 'system' || m.role === 'user') ? m.role : 'assistant',
      content: m.content,
    }));
  }

  /** Non-streamed completion -> returns assistant content string */
  async generate(userMessage, track = true) {
    const payload = {
      model: await getModel(this.config),
      messages: this.toOpenAIFormat(userMessage),
      stream: false,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
    };

    this.log('Request', payload);

    const doFetch = async () => {
      const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: await buildHeaders(this.config),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        const err = tryJson(text) || { error: { message: text } };
        throw new Error(`OpenAI error ${res.status}: ${err?.error?.message || text}`);
      }
      return res.json();
    };

    const json = await backoffRetry(doFetch);
    this.log('Response', json);

    const assistantReply =
      json?.choices?.[0]?.message?.content ?? '';

    if (track && assistantReply) {
      this.messageHistory.addMessage({ role: 'user', content: userMessage });
      this.messageHistory.addMessage({ role: 'assistant', content: assistantReply });
    }

    return assistantReply;
  }

  /**
   * Streamed completion as an async generator yielding content deltas.
   * Usage:
   *   for await (const chunk of client.generateStream("Hello")) { ... }
   */
  async *generateStream(userMessage, track = true) {
    const payload = {
      model: await getModel(this.config),
      messages: this.toOpenAIFormat(userMessage),
      stream: true,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
    };

    this.log('Stream Request', payload);

    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: await buildHeaders(this.config),
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI stream error ${res.status}: ${text}`);
    }

    const decoder = new TextDecoder('utf-8');
    const reader = res.body.getReader();

    let full = '';
    let buffer = '';

    try {
      // Read and parse SSE
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 1);

          if (!line) continue;
          if (!line.startsWith('data:')) continue;

          const data = line.slice(5).trim();       // after 'data:'
          if (data === '[DONE]') {
            buffer = ''; // flush
            break;
          }

          const json = tryJson(data);
          if (!json) continue;

          const delta = json?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            yield delta;
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }

    if (track && full) {
      this.messageHistory.addMessage({ role: 'user', content: userMessage });
      this.messageHistory.addMessage({ role: 'assistant', content: full });
    }
  }

  /**
   * Vision: describe an image by URL (OpenAI vision via chat/completions).
   * @param {string} imageUrl
   * @param {string} prompt
   * @param {'auto'|'low'|'high'} detail
   */
  async describeImageByUrl(imageUrl, prompt = 'Describe this image in detail.', detail = 'auto') {
    const payload = {
      model: await getModel(this.config),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail } },
          ],
        },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
    };

    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: await buildHeaders(this.config),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text}`);
    }
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Vision: describe an image by bytes (Blob/File/ArrayBuffer).
   * Will send as a data URL in image_url.
   * @param {Blob|ArrayBuffer|Uint8Array} input
   */
  async describeImageByBytes(input, prompt = 'Describe this image in detail.', detail = 'auto') {
    let dataUrl;
    if (input instanceof Blob) {
      dataUrl = await blobToBase64(input); // e.g. data:image/png;base64,....
    } else {
      const ab = input instanceof ArrayBuffer ? input : input.buffer;
      const b64 = arrayBufferToBase64(ab);
      // default to jpeg if unknown; you can detect/parametrize this
      dataUrl = `data:image/jpeg;base64,${b64}`;
    }

    return this.describeImageByUrl(dataUrl, prompt, detail);
  }
}

// ---------------------------
// OpenAI Image Client (images/generations + edits)
// ---------------------------
export class OpenAIImageClient extends ClientBase {
  constructor(config = {}, messageHistory = new ChatMessageHistory()) {
    super(config, messageHistory);
    this.config.model = this.config.model || 'dall-e-3';
  }

  /**
   * Generate images -> returns array of **URLs** (response_format='url').
   */
  async generateImageUrls(prompt, { n = 1, size = '1024x1024', quality = 'hd', style = 'vivid' } = {}) {
    const payload = {
      prompt,
      model: this.config.model,
      n,
      size,         // '1024x1024' | '1024x1792' | '1792x1024'
      quality,      // 'standard' | 'hd'
      style,        // 'vivid' | 'natural'
      response_format: 'url',
    };

    const res = await fetch(`${this.config.baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: await buildHeaders(this.config),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI image error ${res.status}: ${text}`);
    }
    const json = await res.json();
    return (json?.data || [])
      .map(d => d.url)
      .filter(Boolean);
  }

  /**
   * Generate images -> returns array of **Uint8Array** (response_format='b64_json').
   */
  async generateImageBytes(prompt, { n = 1, size = '1024x1024', quality = 'hd', style = 'vivid' } = {}) {
    const payload = {
      prompt,
      model: this.config.model,
      n,
      size,
      quality,
      style,
      response_format: 'b64_json',
    };

    const res = await fetch(`${this.config.baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: await buildHeaders(this.config),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI image error ${res.status}: ${text}`);
    }
    const json = await res.json();

    /** @type {Uint8Array[]} */
    const output = [];
    for (const item of json?.data || []) {
      const b64 = item?.b64_json;
      if (!b64) continue;
      const binStr = atob(b64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
      output.push(bytes);
    }
    return output;
  }

  /**
   * Edit image (with optional transparent mask). Returns array of Uint8Array.
   * @param {Blob|Uint8Array|ArrayBuffer} image
   * @param {string} prompt
   * @param {Blob|Uint8Array|ArrayBuffer|null} mask
   */
  async editImageBytes(image, prompt, { mask = null, n = 1, size = '1024x1024', responseFormat = 'b64_json' } = {}) {
    // Build multipart/form-data manually (no FormData boundary shenanigans in MV3)
    const key = await getApiKey(this.config);
    const form = new FormData();

    const toBlob = async (data, defaultType = 'image/png') => {
      if (data instanceof Blob) return data;
      if (data instanceof Uint8Array) return new Blob([data], { type: defaultType });
      if (data instanceof ArrayBuffer) return new Blob([new Uint8Array(data)], { type: defaultType });
      throw new Error('Unsupported image/mask type');
    };

    form.append('image', await toBlob(image), 'image.png');
    if (mask) form.append('mask', await toBlob(mask), 'mask.png');
    form.append('prompt', prompt);
    form.append('n', String(n));
    form.append('size', size);
    form.append('response_format', responseFormat);

    const res = await fetch(`${this.config.baseUrl}/v1/images/edits`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` }, // FormData sets its own Content-Type boundary
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI image edit error ${res.status}: ${text}`);
    }
    const json = await res.json();

    /** @type {Uint8Array[]} */
    const output = [];
    for (const item of json?.data || []) {
      const b64 = item?.b64_json;
      if (!b64) continue;
      const binStr = atob(b64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
      output.push(bytes);
    }
    return output;
  }
}

// ---------------------------
// Example usage in MV3 background (optional)
// ---------------------------
// manifest.json:
// "host_permissions": ["https://api.openai.com/*"],
// "permissions": ["storage"]

/*
// background/index.js
import { OpenAIChatClient, OpenAIImageClient, ChatMessageHistory } from './openaiClient.js';

const history = new ChatMessageHistory();
const chat = new OpenAIChatClient(
  { loggingEnabled: true }, // you can also pass { apiKey: '...' }
  history
);

// Store your key once from the popup/options:
// await chrome.storage.local.set({ OPENAI_KEY: 'sk-...' });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'L2R_PROMPT') {
      const reply = await chat.generate(msg.prompt);
      sendResponse({ ok: true, reply });
    }
    if (msg?.type === 'L2R_PROMPT_STREAM') {
      // Example: stream to the popup via Port
      const port = chrome.tabs?.connect?.(sender.tab.id, { name: 'L2R_STREAM' });
      let full = '';
      for await (const chunk of chat.generateStream(msg.prompt)) {
        full += chunk;
        port?.postMessage({ type: 'delta', chunk });
      }
      port?.postMessage({ type: 'done', full });
      sendResponse({ ok: true });
    }
  })();
  return true; // keep channel open
});
*/

// ---------------------------
// Small sanity self-test (optional)
// ---------------------------
/*
(async () => {
  const history = new ChatMessageHistory();
  const client = new OpenAIChatClient({ apiKey: 'sk-xxxx', loggingEnabled: true }, history);
  const text = await client.generate('Say hi in 10 words.');
  console.log('Non-stream:', text);

  let collected = '';
  for await (const d of client.generateStream('Stream a 10-word sentence.')) {
    collected += d;
  }
  console.log('Stream:', collected);

  const vision = await client.describeImageByUrl('https://upload.wikimedia.org/wikipedia/commons/9/99/Black_square.jpg', 'What is this?');
  console.log('Vision:', vision);

  const imgs = await new OpenAIImageClient({ apiKey: 'sk-xxxx' }).generateImageUrls('A tiny robot made of gears.');
  console.log('Image URLs:', imgs);
})();
*/
