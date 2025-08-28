/* eslint-disable no-unused-vars */
export function TimedActionsTab({ bus }) {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <h3>Timed Actions (Coming Soon)</h3>
    <p class="small muted">
      This tab will schedule summaries, memory writes, and random conversation spice via moods & humor.
      Recommended architecture: move timers to <code>background</code> using <code>chrome.alarms</code>, 
      postMessage to the content script to act when the chat is open.
    </p>

    <div class="row">
      <label>Examples (planned)</label>
      <ul class="small">
        <li>Every 20–40 mins (randomized): inject a playful quip with current mood</li>
        <li>On demand: “Summarize last 15 min”, “Create memory”, “Tag mood”</li>
        <li>Nightly: create a day summary and store alongside image highlights</li>
      </ul>
    </div>
  `;
  return wrap;
}
