# LinkToReplika — Chrome Extension

A tiny Chrome extension that injects a **control panel** into the Replika web app and links its conversation to **OpenAI**. It watches for new Replika messages, sends relevant context to your chosen OpenAI model, and (optionally) auto-injects the reply back into the chat.

## ✨ Features

* Inline **floating control panel** (no popup/background needed)
* Paste & save your **OpenAI API key**
* **Model selector** (built-ins + custom id)
* **Linking toggle** (auto-reply on/off) & **“approve before sending”** mode
* **Max turns**, **system prompt**, and **manual send**
* **Live log** of Replika ↔ OpenAI turns
* **Context persistence** (last \~32 msgs, size-clamped) in `chrome.storage.local`
* **Draggable** UI & quick **toggle hotkey**: `Ctrl + Shift + L`

---

## 🏗️ Architecture

* **Manifest V3** with a **single content script**:

  * Injects a Shadow DOM panel into `https://my.replika.com/*`
  * Observes new Replika messages via DOM mutations
  * Calls `https://api.openai.com/v1/chat/completions` with your key
  * Simulates typing/Enter to send replies into the chat
* **No service worker/popup** required
* **Storage**: settings & context in `chrome.storage.local`

---

## 📁 Project Layout

```
/public
  manifest.json
  icons/                 # 16/32/48/128 etc
/src
  /content
    replika-panel.js     # main content script (injects panel + handles logic)
```

> If you’re using Vite + CRXJS, your built files will land in `dist/`. Ensure `manifest.json` points at the emitted content script path.

---

## ⚙️ Install & Run

### Option A — No bundler (simplest)

1. Put `manifest.json` and `src/content/replika-panel.js` in your project.
2. In `manifest.json`, reference the script directly:

   ```json
   {
     "manifest_version": 3,
     "name": "LinkToReplika",
     "version": "0.2.0",
     "permissions": ["storage"],
     "host_permissions": ["https://api.openai.com/*", "https://my.replika.com/*"],
     "content_scripts": [
       {
         "matches": ["https://my.replika.com/*"],
         "js": ["src/content/replika-panel.js"],
         "run_at": "document_end"
       }
     ],
     "action": { "default_title": "LinkToReplika" },
     "icons": {
       "16": "icons/icon16.png",
       "32": "icons/icon32.png",
       "48": "icons/icon48.png",
       "128": "icons/icon128.png"
     }
   }
   ```
3. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select your project root.
4. Visit `https://my.replika.com/`. The panel appears at bottom-right.

### Option B — Vite + CRXJS (nice DX)

1. `npm i -D vite @crxjs/vite-plugin`
2. Configure CRXJS to read `public/manifest.json` and include `src/content/replika-panel.js`.
3. Dev: `npm run dev` (CRXJS HMR for content is limited; a refresh usually applies).
4. Build: `npm run build` → load `dist/` via **Load unpacked**.

> If your bundler changes file names/paths, update `manifest.json` accordingly.

---

## 🧪 Using the Panel

1. Open Replika web (`https://my.replika.com/`).
2. Press `Ctrl + Shift + L` to toggle the panel if it’s hidden.
3. Paste your **OpenAI API key** → **Save**.
4. Pick a **model** (or enter a custom id) → **Save**.
5. (Optional) Set **system prompt**, **max turns**, and **approve before sending**.
6. Toggle **Link OpenAI ↔ Replika** on.
7. When a **new Replika message** appears, the panel will:

   * call OpenAI with (system + recent context + new message),
   * display the reply in the log,
   * and either **auto-send** or show an **approval chip** to send/discard.

**Manual send**: type into the “Manual send” field and click **Send** to inject your own text.

---

## 💾 Persistence

* Settings saved keys:

  * `OPENAI_KEY`, `OPENAI_MODEL`, `L2R_ENABLED`, `L2R_APPROVE`, `L2R_MAX_TURNS`, `L2R_SYSTEM_PROMPT`
* Context saved keys:

  * `L2R_HISTORY` (array of `{ role: 'user'|'assistant', content }`)
  * `L2R_TURNS` (number)
* We clamp to the **last \~32 messages** and a **\~15k char** budget for safety.

Use the **Reset ctx** button (in the panel) to clear persisted context quickly.

---

## 🔐 Security Notes

* Your OpenAI key is stored **locally** via `chrome.storage.local` and used **client-side**.
  Treat this as semi-sensitive: anyone with full local profile access could read it.
* For stricter security, proxy requests through your own backend and **never** store raw keys in the browser.
* Only use this on accounts and sites you own or are allowed to automate. **Respect Replika’s Terms of Service**.

---

## 🧩 Permissions

* `"storage"` — save settings and context
* Host:

  * `"https://api.openai.com/*"` — call OpenAI
  * `"https://my.replika.com/*"` — run content script on Replika

No other permissions are required.

---

## 🔧 Customization

* **Selectors**: If Replika changes its DOM:

  * Input finder: `findInput()` in `replika-panel.js`
  * Message observer target: `[data-testid="chat-message-text"][data-author="replika"]`
* **Behavior**:

  * Turn streaming on (future): swap the chat completion to a streaming endpoint and append deltas to the log.
  * Change context size: tweak `MAX_CTX_MSGS` / `MAX_CTX_CHARS`.

---

## 🐛 Troubleshooting

* **Panel doesn’t appear**: confirm `host_permissions` and URL match `https://my.replika.com/*`; reload the page.
* **Replies not sending**: input selector may have changed; update `findInput()` or increase the fallback click delay.
* **OpenAI errors**: check the log panel for status codes; verify API key/model and account limits.

---

## 🗺️ Roadmap

* Token **streaming** into the live log
* Multi-tab/session isolation
* Export/Import of saved context
* Model capabilities & cost hints next to selector
* Optional rate limiter / cooldown

---

## 📝 License

MIT © You — enjoy!
