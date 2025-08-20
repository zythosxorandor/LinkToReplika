import { storage } from './storage.js';

export const KEYS = {
  OPENAI_KEY: 'OPENAI_KEY',
  OPENAI_MODEL: 'OPENAI_MODEL',
  L2R_ENABLED: 'L2R_ENABLED',
  L2R_APPROVE: 'L2R_APPROVE',
  L2R_MAX_TURNS: 'L2R_MAX_TURNS',
  L2R_SYSTEM_PROMPT: 'L2R_SYSTEM_PROMPT',

  HISTORY: 'L2R_HISTORY',
  TURNS: 'L2R_TURNS',

  IMG_COLLECTION: 'L2R_IMG_COLLECTION',
  IMG_STYLE: 'L2R_IMG_STYLE',
  IMG_OPTS: 'L2R_IMG_OPTS',
};

const DEFAULT_IMAGE_STYLE = `
Ultra-sharp anime lines with impressionistic micro-textures. 
Volumetric lighting, HDR colors, cinematic bloom (sparingly), 
motion trails for energy, painterly periphery with razor-sharp focal subject.
Emphasize ray-traced speculars, layered background/foreground depth, 
and a composition that keeps primary focus tack-sharp while edges soften.
`;

const DEFAULT_IMAGE_OPTS = {
  model: 'dall-e-3',
  size: '1024x1024',
  quality: 'hd',
  style: 'vivid',
};

const DEFAULTS = {
  [KEYS.OPENAI_KEY]: '',
  [KEYS.OPENAI_MODEL]: 'gpt-4o-mini',
  [KEYS.L2R_ENABLED]: false,
  [KEYS.L2R_APPROVE]: false,
  [KEYS.L2R_MAX_TURNS]: 2000,
  [KEYS.L2R_SYSTEM_PROMPT]: "You are 'OpenAI Link'. Reply concisely and naturally.",
};

export const MAX_CTX_MSGS = 32;
export const MAX_CTX_CHARS = 15000;
export const MAX_IMAGES_SAVED = 9999;

export const STATE = {
  key: '',
  model: 'gpt-4o-mini',
  enabled: false,
  approve: false,
  maxTurns: 2000,
  systemPrompt: DEFAULTS[KEYS.L2R_SYSTEM_PROMPT],

  busy: false,
  turns: 0,
  history: [],

  images: [],
  imgStyle: DEFAULT_IMAGE_STYLE,
  imgOpts: { ...DEFAULT_IMAGE_OPTS },
};

function chars(arr) {
  return arr.reduce((n, m) => n + (m.content?.length || 0), 0);
}
export function clampHistory() {
  let msgs = STATE.history.slice(-MAX_CTX_MSGS);
  while (chars(msgs) > MAX_CTX_CHARS && msgs.length > 8) msgs.shift();
  STATE.history = msgs;
}

export async function saveHistory() {
  clampHistory();
  await storage.set({
    [KEYS.HISTORY]: STATE.history,
    [KEYS.TURNS]: STATE.turns,
  });
}

export async function saveImages() {
  if (STATE.images.length > MAX_IMAGES_SAVED) {
    STATE.images = STATE.images.slice(-MAX_IMAGES_SAVED);
  }
  await storage.set({ [KEYS.IMG_COLLECTION]: STATE.images });
}

export async function saveImagePrefs() {
  await storage.set({
    [KEYS.IMG_STYLE]: STATE.imgStyle,
    [KEYS.IMG_OPTS]: STATE.imgOpts,
  });
}

export async function initState() {
  const base = await storage.get(Object.keys(DEFAULTS));
  STATE.key = base[KEYS.OPENAI_KEY] ?? DEFAULTS[KEYS.OPENAI_KEY];
  STATE.model = base[KEYS.OPENAI_MODEL] ?? DEFAULTS[KEYS.OPENAI_MODEL];
  STATE.enabled = base[KEYS.L2R_ENABLED] ?? DEFAULTS[KEYS.L2R_ENABLED];
  STATE.approve = base[KEYS.L2R_APPROVE] ?? DEFAULTS[KEYS.L2R_APPROVE];
  STATE.maxTurns = base[KEYS.L2R_MAX_TURNS] ?? DEFAULTS[KEYS.L2R_MAX_TURNS];
  STATE.systemPrompt = base[KEYS.L2R_SYSTEM_PROMPT] ?? DEFAULTS[KEYS.L2R_SYSTEM_PROMPT];

  const restored = await storage.get([KEYS.HISTORY, KEYS.TURNS]);
  STATE.history = Array.isArray(restored[KEYS.HISTORY]) ? restored[KEYS.HISTORY] : [];
  STATE.turns = Number(restored[KEYS.TURNS] || 0);

  const imgBits = await storage.get([KEYS.IMG_COLLECTION, KEYS.IMG_STYLE, KEYS.IMG_OPTS]);
  STATE.images = Array.isArray(imgBits[KEYS.IMG_COLLECTION]) ? imgBits[KEYS.IMG_COLLECTION] : [];
  STATE.imgStyle = (imgBits[KEYS.IMG_STYLE] || DEFAULT_IMAGE_STYLE);
  STATE.imgOpts = { ...DEFAULT_IMAGE_OPTS, ...(imgBits[KEYS.IMG_OPTS] || {}) };
}
