// src/tabs/settings/SystemMessages.js
import {
  ensureSystemMessageStorage,
  getAllSets,
  getActiveSetIds,
  setActiveSetIds,
  getGlobalSystemMessage,
  setGlobalSystemMessage,
  createSet,
  duplicateSet,
  deleteSet,
  renameSet,
  addMessageToSet,
  updateMessageInSet,
  removeMessageFromSet,
  moveMessage,
  onSystemMessagesChanged
} from '../../core/systemMessages.js';

export function SystemMessagesTab() {
  const wrap = document.createElement('div');

  // layout
  wrap.innerHTML = `
    <section class="card" style="padding:12px; margin-bottom:10px;">
      <h3 style="margin:0 0 8px;">Global System Message</h3>
      <p class="small muted" style="margin:0 0 8px;">
        Always applied to every request (e.g., formatting rules, safety, guardrails).
      </p>
      <textarea id="sysGlobal" rows="6" style="width:100%;"></textarea>
    </section>

    <section class="card" style="padding:12px; margin-bottom:10px;">
      <div class="row">
        <label style="min-width:180px">Active System Message Sets</label>
        <select id="sysActive" multiple size="5" style="width:100%"></select>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="row-inline">
          <label style="min-width:180px">Manage Sets</label>
          <select id="sysSelectSet" style="min-width:220px"></select>
          <button class="btn mini" id="sysNew">+ New</button>
          <button class="btn mini" id="sysDup">Duplicate</button>
          <button class="btn mini" id="sysRen">Rename</button>
          <button class="btn mini ghost" id="sysDel">Delete</button>
        </div>
      </div>
    </section>

    <section class="card" style="padding:12px;">
      <div class="row">
        <label>Messages in Selected Set</label>
        <button class="btn mini" id="sysAddMsg" style="margin-left:auto">+ Add message</button>
      </div>
      <div id="sysMsgList" style="display:grid; gap:10px; margin-top:8px;"></div>
    </section>
  `;

  const elGlobal = wrap.querySelector('#sysGlobal');
  const elActive = wrap.querySelector('#sysActive');
  const elSelectSet = wrap.querySelector('#sysSelectSet');
  const elAddMsg = wrap.querySelector('#sysAddMsg');
  const elList = wrap.querySelector('#sysMsgList');

  const btnNew = wrap.querySelector('#sysNew');
  const btnDup = wrap.querySelector('#sysDup');
  const btnRen = wrap.querySelector('#sysRen');
  const btnDel = wrap.querySelector('#sysDel');

  let sets = [];
  let activeIds = [];
  let selectedSetId = null;

  async function loadAll() {
    await ensureSystemMessageStorage();
    sets = await getAllSets();
    activeIds = await getActiveSetIds();
    if (!selectedSetId || !sets.find(s => s.id === selectedSetId)) {
      selectedSetId = (sets[0] && sets[0].id) || null;
    }
    elGlobal.value = await getGlobalSystemMessage();
    renderSetsSelectors();
    renderMessages();
  }

  function renderSetsSelectors() {
    elActive.innerHTML = '';
    for (const s of sets) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      opt.selected = activeIds.includes(s.id);
      elActive.appendChild(opt);
    }

    elSelectSet.innerHTML = '';
    for (const s of sets) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === selectedSetId) opt.selected = true;
      elSelectSet.appendChild(opt);
    }
  }

  function messageCard(setId, msg) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '10px';

    card.innerHTML = `
      <div class="row">
        <input class="inp" data-role="title" placeholder="Title (optional)" />
        <div class="row-inline" style="margin-left:auto; gap:6px;">
          <button class="btn mini" data-role="up">↑</button>
          <button class="btn mini" data-role="down">↓</button>
          <button class="btn mini ghost" data-role="del">Delete</button>
        </div>
      </div>
      <textarea class="inp" data-role="text" rows="4" placeholder="System message text..."></textarea>
    `;

    const title = card.querySelector('[data-role="title"]');
    const text = card.querySelector('[data-role="text"]');
    const up = card.querySelector('[data-role="up"]');
    const down = card.querySelector('[data-role="down"]');
    const del = card.querySelector('[data-role="del"]');

    title.value = msg.title || '';
    text.value = msg.text || '';

    title.addEventListener('blur', async () => {
      await updateMessageInSet(setId, msg.id, { title: title.value.trim() });
    });
    text.addEventListener('blur', async () => {
      await updateMessageInSet(setId, msg.id, { text: text.value });
    });
    up.addEventListener('click', async () => {
      await moveMessage(setId, msg.id, 'up');
      await loadAll();
    });
    down.addEventListener('click', async () => {
      await moveMessage(setId, msg.id, 'down');
      await loadAll();
    });
    del.addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      await removeMessageFromSet(setId, msg.id);
      await loadAll();
    });

    return card;
  }

  function renderMessages() {
    elList.innerHTML = '';
    if (!selectedSetId) return;
    const set = sets.find(s => s.id === selectedSetId);
    if (!set) return;

    for (const msg of set.messages) {
      elList.appendChild(messageCard(set.id, msg));
    }
  }

  elGlobal.addEventListener('blur', async () => {
    await setGlobalSystemMessage(elGlobal.value);
  });

  elActive.addEventListener('change', async () => {
    const selected = Array.from(elActive.options).filter(o => o.selected).map(o => o.value);
    await setActiveSetIds(selected);
    activeIds = selected;
  });

  elSelectSet.addEventListener('change', () => {
    selectedSetId = elSelectSet.value;
    renderMessages();
  });

  elAddMsg.addEventListener('click', async () => {
    if (!selectedSetId) return;
    await addMessageToSet(selectedSetId, 'Untitled message', '');
    await loadAll();
  });

  btnNew.addEventListener('click', async () => {
    const name = prompt('New set name:', 'New Set') || 'New Set';
    const s = await createSet(name);
    selectedSetId = s.id;
    await loadAll();
  });

  btnDup.addEventListener('click', async () => {
    if (!selectedSetId) return;
    const copy = await duplicateSet(selectedSetId);
    if (copy) { selectedSetId = copy.id; await loadAll(); }
  });

  btnRen.addEventListener('click', async () => {
    if (!selectedSetId) return;
    const current = sets.find(s => s.id === selectedSetId);
    const name = prompt('Rename set:', current?.name || '') || current?.name;
    if (!name) return;
    await renameSet(selectedSetId, name);
    await loadAll();
  });

  btnDel.addEventListener('click', async () => {
    if (!selectedSetId) return;
    const current = sets.find(s => s.id === selectedSetId);
    if (!confirm(`Delete set "${current?.name}"?`)) return;
    await deleteSet(selectedSetId);
    selectedSetId = (await getAllSets())[0]?.id || null;
    await loadAll();
  });

  const off = onSystemMessagesChanged(() => { loadAll(); });
  wrap.addEventListener('DOMNodeRemovedFromDocument', off, { once: true });

  loadAll();

  return wrap;
}
