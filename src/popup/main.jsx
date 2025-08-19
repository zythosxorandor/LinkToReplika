/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
// src/popup/main.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

const DEFAULT_MODEL = 'gpt-4o-mini';
const MODEL_OPTIONS = ['gpt-4o-mini', 'gpt-4o', 'o4-mini'];

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function TopBar({ apiKey, setApiKey, model, setModel }) {
  const [showKey, setShowKey] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    (async () => {
      const { OPENAI_KEY = '', OPENAI_MODEL = DEFAULT_MODEL } = await storageGet([
        'OPENAI_KEY',
        'OPENAI_MODEL',
      ]);
      setApiKey(OPENAI_KEY);
      setModel(OPENAI_MODEL);
    })();
  }, []);

  const saveKey = async () => {
    await storageSet({ OPENAI_KEY: apiKey });
    flash('Key saved');
  };
  const saveModel = async (value) => {
    await storageSet({ OPENAI_MODEL: value });
    setModel(value);
    flash('Model saved');
  };
  const flash = (m) => {
    setHint(m);
    setTimeout(() => setHint(''), 1200);
  };

  const onModelSelect = (e) => {
    const v = e.target.value;
    if (v === '__custom__') setCustomModel('');
    else saveModel(v);
  };
  const onCustomModelSave = () => {
    const v = customModel.trim();
    if (v) saveModel(v);
    setCustomModel('');
  };

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', padding: 10, background: '#f9fafb' }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>LinkToReplika • OpenAI</h3>

      <Row label="API Key">
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            style={{ flex: 1, padding: 6 }}
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={saveKey}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
          />
          <button onClick={() => setShowKey((s) => !s)}>{showKey ? 'Hide' : 'Show'}</button>
          <button onClick={saveKey}>Save</button>
        </div>
      </Row>

      <Row label="Model">
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={MODEL_OPTIONS.includes(model) ? model : '__custom__'}
            onChange={onModelSelect}
            style={{ flex: 1, padding: 6 }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
          {model && !MODEL_OPTIONS.includes(model) && (
            <span style={{ alignSelf: 'center', fontSize: 12, opacity: 0.7 }}>{model}</span>
          )}
        </div>
        {customModel !== '' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              style={{ flex: 1, padding: 6 }}
              placeholder="Enter custom model id"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCustomModelSave()}
            />
            <button onClick={onCustomModelSave}>Save</button>
          </div>
        )}
      </Row>

      {hint && <div style={{ fontSize: 12, color: '#059669' }}>{hint}</div>}
    </div>
  );
}

export function PopupApp() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);

  const [enabled, setEnabled] = useState(false);
  const [approve, setApprove] = useState(false);
  const [maxTurns, setMaxTurns] = useState(20);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are 'OpenAI Link'. Talk concisely. Avoid long monologues. Respond naturally.",
  );
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState(0);
  const [log, setLog] = useState([]); // {role:'replika'|'openai'|'info'|'error', content:string}

  const [manualText, setManualText] = useState('');

  const portRef = useRef(null);

  useEffect(() => {
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    const port = chrome.runtime.connect({ name: 'L2R_POPUP' });
    portRef.current = port;

    // BIND POPUP TO TAB
    port.postMessage({ type: 'L2R_BIND_TAB', tabId });

    port.onMessage.addListener((m) => {
      if (m?.type === 'L2R_STATE') {
        const p = m.payload || {};
        setEnabled(!!p.enabled);
        setApprove(!!p.approve);
        setMaxTurns(p.maxTurns ?? 20);
        setSystemPrompt(p.systemPrompt || systemPrompt);
        setBusy(!!p.busy);
        setTurns(p.turns || 0);
        setLog(((p.history || []).map(h => ({
          role: h.role === 'assistant' ? 'openai' : (h.role === 'user' ? 'replika' : 'info'),
          content: h.content,
        }))));
      }
      if (m?.type === 'L2R_STATE_PATCH') {
        const p = m.payload || {};
        if (p.enabled !== undefined) setEnabled(!!p.enabled);
        if (p.approve !== undefined) setApprove(!!p.approve);
        if (p.maxTurns !== undefined) setMaxTurns(p.maxTurns);
        if (p.systemPrompt !== undefined) setSystemPrompt(p.systemPrompt);
        if (p.busy !== undefined) setBusy(!!p.busy);
        if (p.turns !== undefined) setTurns(p.turns);
        if (p.history !== undefined) setLog([]);
      }
      if (m?.type === 'L2R_LOG')   setLog((prev) => [...prev, m.payload]);
      if (m?.type === 'L2R_INFO')  setLog((prev) => [...prev, { role: 'info',  content: String(m.payload || '') }]);
      if (m?.type === 'L2R_ERROR') setLog((prev) => [...prev, { role: 'error', content: String(m.payload || '') }]);
    });
  })();

  return () => portRef.current?.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  const send = (type, payload) => portRef.current?.postMessage({ type, ...payload });

  return (
    <div style={{ width: 380, fontFamily: 'system-ui, Arial', borderRadius: 10, overflow: 'hidden' }}>
      <TopBar apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />

      <div style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => send('L2R_SET_ENABLED', { enabled: e.target.checked })}
            />
            Link OpenAI ↔ Replika (this tab)
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={approve}
              onChange={(e) => send('L2R_SET_APPROVE', { approve: e.target.checked })}
            />
            Approve before sending
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Max turns:
            <input
              style={{ width: 60 }}
              type="number"
              min="1"
              value={maxTurns}
              onChange={(e) => send('L2R_SET_MAX_TURNS', { maxTurns: Number(e.target.value) })}
            />
          </label>
          <button onClick={() => send('L2R_STOP') } disabled={!busy}>Stop</button>
          <button onClick={() => send('L2R_CLEAR') }>Clear</button>
          <div style={{ marginLeft: 'auto', opacity: 0.7, fontSize: 12 }}>
            {busy ? 'Thinking…' : 'Idle'} • Turns: {turns}
          </div>
        </div>

        <Row label="System prompt (optional)">
          <textarea
            rows={3}
            style={{ width: '100%', padding: 6 }}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={() => send('L2R_SET_SYSTEM_PROMPT', { systemPrompt })}
          />
        </Row>

        <Row label="Manual send">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, padding: 6 }}
              placeholder="Type and inject into Replika"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send('L2R_MANUAL_SEND', { text: manualText })}
            />
            <button onClick={() => send('L2R_MANUAL_SEND', { text: manualText })}>Send</button>
          </div>
        </Row>

        <Row label="Live log">
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: 8,
            height: 220,
            overflow: 'auto',
            background: '#fafafa'
          }}>
            {log.length === 0 && <div style={{ opacity: 0.6, fontSize: 12 }}>No messages yet.</div>}
            {log.map((m, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <span style={{
                  display: 'inline-block',
                  minWidth: 70,
                  fontSize: 12,
                  color:
                    m.role === 'openai' ? '#2563eb' :
                    m.role === 'replika' ? '#059669' :
                    m.role === 'error' ? '#dc2626' : '#6b7280'
                }}>
                  {m.role.toUpperCase()}
                </span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
              </div>
            ))}
          </div>
        </Row>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PopupApp />);
