// src/tabs/SettingsTab.js
import { NavTabs } from '../ui/NavTabs.js';
import { OpenAITab } from './settings/OpenAI.js';
import { GoogleGeminiTab } from './settings/GoogleGemini.js';
import { GithubTab } from './settings/Github.js';
import { ReplikaDetailsTab } from './settings/ReplikaDetails.js';
import { SystemMessagesTab } from './settings/SystemMessages.js';
import { UserDetailsTab } from './settings/UserDetails.js';

export function SettingsTab({ bus }) {
  const wrap = document.createElement('section');
  const tabs = [
  { id: 'openai',   title: 'OpenAI',         icon: '🤖', render: () => OpenAITab({ bus }) },
  { id: 'gemini',   title: 'Google Gemini',  icon: '🔷', render: () => GoogleGeminiTab({ bus }) },
  { id: 'github',   title: 'GitHub',         icon: '🐙', render: () => GithubTab({ bus }) },
  { id: 'user',     title: 'User Details',   icon: '👤', render: () => UserDetailsTab({ bus }) },
  { id: 'replika',  title: 'Replika Details',icon: '💬', render: () => ReplikaDetailsTab({ bus }) },
  { id: 'system',   title: 'System Messages',icon: '⚙️', render: () => SystemMessagesTab({ bus }) },
];
  const view = NavTabs({ tabs, activeId: 'openai' });
  wrap.appendChild(view);
  return wrap;
}

