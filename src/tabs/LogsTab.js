import { escapeHTML, clip } from '../core/util.js';
import { injectReply } from '../core/replika-dom.js';

export function LogsTab({ bus }) {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <div class="row">
      <label class="hrow">
        <span>Live log</span>
        <button class="btn mini" id="l2rClearLog">Clear</button>
      </label>
      <div class="log" id="l2rLog"></div>
      <div id="l2rApproveList"></div>
    </div>
  `;

  const logEl = wrap.querySelector('#l2rLog');
  const clearBtn = wrap.querySelector('#l2rClearLog');
  const approveList = wrap.querySelector('#l2rApproveList');

  clearBtn.addEventListener('click', () => { logEl.innerHTML = ''; });

  function addLogLine(tag, text) {
    const line = document.createElement('div');
    line.className = 'line';
    const pill = document.createElement('span');
    pill.className = `tag ${tag}`; pill.textContent = String(tag).toUpperCase();
    const body = document.createElement('span');
    body.innerHTML = ' ' + escapeHTML(clip(text, 4000));
    line.appendChild(pill); line.appendChild(body);
    logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight;
  }

  function addApprovalChip(text) {
    const wrapChip = document.createElement('div');
    wrapChip.className = 'chip';
    wrapChip.innerHTML = `
      <div class="small muted">Pending approval</div>
      <div class="small" style="white-space:pre-wrap">${escapeHTML(text)}</div>
      <div class="actions">
        <button class="btn primary" data-act="send">Send</button>
        <button class="btn" data-act="discard">Discard</button>
      </div>
    `;
    const onClick = async (e) => {
      const act = e.target?.getAttribute?.('data-act');
      if (!act) return;
      if (act === 'send') {
        try { await injectReply(text); } catch (err) { addLogLine('error', `Send failed: ${String(err.message || err)}`); }
      }
      wrapChip.remove();
    };
    wrapChip.addEventListener('click', onClick);
    approveList.appendChild(wrapChip);
  }

  // bus hooks
  bus.on('log', ({ tag, text }) => addLogLine(tag, text));
  bus.on('approval:add', (text) => addApprovalChip(text));

  return wrap;
}
