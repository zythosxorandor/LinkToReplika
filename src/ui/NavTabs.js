export function NavTabs({ tabs, onChange, activeId }) {
  const wrap = document.createElement('div');
  wrap.className = 'l2r-tabs-wrap';
  wrap.innerHTML = `
    <br />
    <div class="l2r-tabs" role="tablist" aria-label="L2R Tabs"></div>
    <div class="l2r-tabpanel" role="tabpanel"></div>
  `;
  const bar = wrap.querySelector('.l2r-tabs');
  const panel = wrap.querySelector('.l2r-tabpanel');

  let current = activeId || tabs[0]?.id;

  function renderBar() {
    bar.innerHTML = '';
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'l2r-tab' + (t.id === current ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(t.id === current));
      if (t.icon) { btn.innerHTML = t.icon; btn.title = t.title; btn.setAttribute("aria-label", t.title); } else { btn.textContent = t.title; }
      btn.addEventListener('click', () => {
        current = t.id;
        renderBar();
        renderPanel();
        onChange?.(current);
      });
      bar.appendChild(btn);
    });
  }

  function renderPanel() {
    const tab = tabs.find(t => t.id === current) || tabs[0];
    panel.innerHTML = '';
    const el = tab.render();
    panel.appendChild(el);
  }

  renderBar(); renderPanel();
  return wrap;
}

