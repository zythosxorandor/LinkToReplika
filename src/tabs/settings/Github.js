/*
    Github token and repo settings tab
*/
// src/tabs/settings/Github.js
import { STATE, KEYS } from '../../core/state.js';
import { storage } from '../../core/storage.js';

export function GithubTab({ bus }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row">
      <label>GitHub Token</label>
      <div class="row-inline">
        <input id="ghTok" type="password" placeholder="ghp_..." />
        <button class="btn mini" id="ghShow">Show</button>
        <button class="btn mini" id="ghSave">Save</button>
      </div>
      <div class="small muted">Token needs repo scope for writes.</div>
    </div>

    <div class="row">
      <label>Default Repo (optional)</label>
      <input id="ghRepo" placeholder="owner/repo" />
    </div>
  `;

  const tokEl = wrap.querySelector('#ghTok');
  const showBtn = wrap.querySelector('#ghShow');
  const saveBtn = wrap.querySelector('#ghSave');
  const repoEl = wrap.querySelector('#ghRepo');

  tokEl.value = STATE.githubToken ? '••••••••••' : '';
  repoEl.value = STATE.githubRepo || '';

  showBtn.addEventListener('click', () => {
    tokEl.type = tokEl.type === 'password' ? 'text' : 'password';
    if (tokEl.type === 'text' && tokEl.value === '••••••••••') tokEl.value = STATE.githubToken || '';
  });
  saveBtn.addEventListener('click', async () => {
    const token = tokEl.value.trim();
    const repo = repoEl.value.trim();
    if (token && token !== '••••••••••') {
      STATE.githubToken = token;
      await storage.set({ [KEYS.GITHUB_TOKEN]: STATE.githubToken });
    }
    STATE.githubRepo = repo;
    await storage.set({ [KEYS.GITHUB_REPO]: STATE.githubRepo });
    bus?.emit?.('log', { tag: 'info', text: 'GitHub settings saved' });
  });

  return wrap;
}
