/* eslint-disable no-undef */
import React from 'react';
import ReactDOM from 'react-dom/client';

export function Options() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, Arial' }}>
      <h2>LinkToReplika • Options</h2>
      <p>Future: API keys, model pickers, safeguards, and routing.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Options />);

