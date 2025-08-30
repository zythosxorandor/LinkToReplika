// src/core/systemMessages.js
// Uses chrome.storage-backed storage util and fires a DOM event on change.

import { storage } from './storage.js';

export const SYSTEM = {
  GLOBAL_KEY: 'L2R_SYS_GLOBAL',
  SETS_KEY: 'L2R_SYS_SETS',
  ACTIVE_KEY: 'L2R_SYS_ACTIVE',
  LEGACY_KEYS: ['L2R_SYSTEM_PROMPT', 'systemMessage', 'openai.systemMessage'],
};

const uid = () => Math.random().toString(36).slice(2, 10);

async function read(key, fallback) {
  const obj = await storage.get([key]);
  return obj && obj[key] !== undefined ? obj[key] : fallback;
}

async function write(key, value) {
  await storage.set({ [key]: value });
  window.dispatchEvent(new CustomEvent('system-messages-changed'));
}

export async function ensureSystemMessageStorage() {
  let sets = await read(SYSTEM.SETS_KEY, null);
  let active = await read(SYSTEM.ACTIVE_KEY, null);
  let global = await read(SYSTEM.GLOBAL_KEY, null);

  if (global == null) {
    for (const k of SYSTEM.LEGACY_KEYS) {
      const legacy = await read(k, null);
      if (typeof legacy === 'string') { global = legacy; break; }
    }
    if (global == null) global = '';
    await write(SYSTEM.GLOBAL_KEY, global);
  }

  if (!Array.isArray(sets)) {
    const def = { id: uid(), name: 'Default', messages: [] };
    sets = [def];
    await write(SYSTEM.SETS_KEY, sets);
    await write(SYSTEM.ACTIVE_KEY, [def.id]);
    return;
  }
  if (!Array.isArray(active)) {
    await write(SYSTEM.ACTIVE_KEY, sets.map(s => s.id));
  }
}

export async function getGlobalSystemMessage() {
  await ensureSystemMessageStorage();
  return read(SYSTEM.GLOBAL_KEY, '');
}
export async function setGlobalSystemMessage(text) {
  await write(SYSTEM.GLOBAL_KEY, String(text ?? ''));
}

export async function getAllSets() {
  await ensureSystemMessageStorage();
  return read(SYSTEM.SETS_KEY, []);
}
export async function getActiveSetIds() {
  await ensureSystemMessageStorage();
  return read(SYSTEM.ACTIVE_KEY, []);
}
export async function setActiveSetIds(ids) {
  const uniq = Array.from(new Set(ids));
  await write(SYSTEM.ACTIVE_KEY, uniq);
}

export async function createSet(name = 'New Set') {
  const sets = await getAllSets();
  const set = { id: uid(), name, messages: [] };
  sets.push(set);
  await write(SYSTEM.SETS_KEY, sets);
  return set;
}
export async function renameSet(id, newName) {
  const sets = await getAllSets();
  const i = sets.findIndex(s => s.id === id);
  if (i === -1) return;
  sets[i] = { ...sets[i], name: newName };
  await write(SYSTEM.SETS_KEY, sets);
}
export async function duplicateSet(id) {
  const sets = await getAllSets();
  const src = sets.find(s => s.id === id);
  if (!src) return null;
  const copy = { id: uid(), name: `${src.name} (copy)`, messages: src.messages.map(m => ({ id: uid(), title: m.title, text: m.text })) };
  sets.push(copy);
  await write(SYSTEM.SETS_KEY, sets);
  return copy;
}
export async function deleteSet(id) {
  const sets = await getAllSets();
  const nextSets = sets.filter(s => s.id !== id);
  await write(SYSTEM.SETS_KEY, nextSets);
  const active = await getActiveSetIds();
  const nextActive = active.filter(x => x !== id);
  await write(SYSTEM.ACTIVE_KEY, nextActive);
}

export async function addMessageToSet(setId, title = 'Untitled message', text = '') {
  const sets = await getAllSets();
  const i = sets.findIndex(s => s.id === setId);
  if (i === -1) return null;
  const msg = { id: uid(), title, text };
  sets[i] = { ...sets[i], messages: [...sets[i].messages, msg] };
  await write(SYSTEM.SETS_KEY, sets);
  return msg;
}
export async function updateMessageInSet(setId, msgId, patch) {
  const sets = await getAllSets();
  const si = sets.findIndex(s => s.id === setId);
  if (si === -1) return;
  const arr = sets[si].messages.slice();
  const mi = arr.findIndex(m => m.id === msgId);
  if (mi === -1) return;
  arr[mi] = { ...arr[mi], ...patch };
  sets[si] = { ...sets[si], messages: arr };
  await write(SYSTEM.SETS_KEY, sets);
}
export async function removeMessageFromSet(setId, msgId) {
  const sets = await getAllSets();
  const si = sets.findIndex(s => s.id === setId);
  if (si === -1) return;
  const arr = sets[si].messages.filter(m => m.id !== msgId);
  sets[si] = { ...sets[si], messages: arr };
  await write(SYSTEM.SETS_KEY, sets);
}
export async function moveMessage(setId, msgId, dir) {
  const sets = await getAllSets();
  const si = sets.findIndex(s => s.id === setId);
  if (si === -1) return;
  const arr = sets[si].messages.slice();
  const i = arr.findIndex(m => m.id === msgId);
  if (i === -1) return;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  sets[si] = { ...sets[si], messages: arr };
  await write(SYSTEM.SETS_KEY, sets);
}

export async function getEffectiveSystemMessages() {
  await ensureSystemMessageStorage();
  const [global, sets, activeIds] = await Promise.all([
    getGlobalSystemMessage(),
    getAllSets(),
    getActiveSetIds()
  ]);
  const active = new Set(activeIds);
  const fromSets = sets.filter(s => active.has(s.id)).flatMap(s => s.messages.map(m => m.text).filter(Boolean));
  return [global, ...fromSets].filter(v => typeof v === 'string' && v.trim().length);
}

export function onSystemMessagesChanged(handler) {
  const fn = () => handler();
  window.addEventListener('system-messages-changed', fn);
  return () => window.removeEventListener('system-messages-changed', fn);
}
