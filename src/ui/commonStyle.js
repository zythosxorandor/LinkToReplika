export const COMMON_STYLE = `
  :root {
    --l2r-bg: #0b1220;
    --l2r-bg-soft: #0a0f1f;
    --l2r-panel: #111827F2;
    --l2r-fg: #e5e7eb;
    --l2r-muted: #94a3b8;
    --l2r-border: #273248;
    --l2r-accent: #3b82f6;
    --l2r-accent-2: #1f2937;
    --l2r-shadow: 0 10px 30px rgba(0,0,0,.35);
    --l2r-radius: 8px;
  }

  /* Buttons */
  .l2r-btn, .btn, .l2r-tab {
    font: 12px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    padding: 6px 10px; border-radius: 999px; border: 1px solid var(--l2r-border);
    background: var(--l2r-accent-2); color: var(--l2r-fg); cursor: pointer;
    box-shadow: 0 6px 22px rgba(0,0,0,.35);
  }
  .l2r-btn:hover, .btn:hover, .l2r-tab:hover { background: #243041; border-color: #9399a4; }
  .btn.mini, .l2r-btn.mini, .l2r-tab.mini { padding: 3px 8px; font-size: 11px; }

  /* Inputs */
  input, select, textarea {
    font: 12px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    background: var(--l2r-bg-soft);
    color: var(--l2r-fg);
    border: 1px solid var(--l2r-border);
    border-radius: var(--l2r-radius);
    padding: 7px 8px;
  }
  input::placeholder, textarea::placeholder { color: #64748b; }
  input:focus, select:focus, textarea:focus { outline: 1px solid var(--l2r-accent); border-color: var(--l2r-accent); }

  /* Layout */
  .row { display: grid; gap: 6px; }
  .row-inline { display: flex; gap: 8px; align-items: center; }
  .hrow { display: flex; gap: 8px; align-items: center; }
  .small { font-size: 11px; opacity: .9; }
  .muted { color: var(--l2r-muted); }
  .l2r-grid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }

  /* Log-like text area styling (re-usable) */
  .log {
    background: var(--l2r-bg-soft);
    border: 1px dashed var(--l2r-border);
    border-radius: var(--l2r-radius);
    padding: 8px;
    height: 180px;
    overflow: auto;
    color: var(--l2r-fg);
    font-size: 12px; line-height: 1.35;
  }
`;

export function injectCommonStyle(doc = document) {
  if (doc.getElementById('__l2r_common_css')) return;
  const css = doc.createElement('style');
  css.id = '__l2r_common_css';
  css.textContent = COMMON_STYLE;
  doc.documentElement.appendChild(css);
}
