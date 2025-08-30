import { STATE, saveImages, saveImagePrefs } from './state.js';
import { promptFromChatWithStyleLLM } from './llmClient.js';

export function renderGallery(container, { bus }) {
  if (!container) return;
  container.innerHTML = '';
  STATE.images.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'l2r-card';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = it.dataUrl || it.url;
    img.alt = 'generated image';

    const meta = document.createElement('div');
    meta.className = 'l2r-mini';
    meta.textContent = `${new Date(it.at).toLocaleString()} · ${it.size} · ${it.quality}/${it.style}`;

    const actions = document.createElement('div');
    actions.className = 'l2r-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'btn mini';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => window.open(it.dataUrl || it.url, '_blank'));

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn mini ghost';
    copyBtn.textContent = 'Copy Image';
    copyBtn.addEventListener('click', async () => {
      try { const toCopy = it.dataUrl || it.url; await navigator.clipboard.writeText(toCopy); bus.emit('log', { tag: 'info', text: 'Image copied to clipboard.' }); }
      catch { bus.emit('log', { tag: 'warn', text: 'Copy failed.' }); }
    });

    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn mini ghost';
    dlBtn.textContent = 'Download';
    dlBtn.addEventListener('click', async () => {
      try {
        const href = it.dataUrl || it.url;
        const a = document.createElement('a');
        a.href = href;
        a.download = `l2r_${(new Date(it.at)).toISOString().replaceAll(':', '-')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      } catch { bus.emit('log', { tag: 'warn', text: 'Download failed.' }); }
    });

    actions.append(openBtn, copyBtn, dlBtn);
    card.append(img, actions, meta);
    container.appendChild(card);
  });
}

export async function generateImageAndShow({ prompt, bus, galleryEl }) {
  if (!STATE.openaiKey) { bus.emit('log', { tag: 'warn', text: 'Add your OpenAI API key first.' }); return; }

  const { model, size, quality, style } = STATE.imgOpts;
  bus.emit('log', { tag: 'info', text: `Generating image (${size}, ${quality}, ${style})...` });

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STATE.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      style,
      response_format: 'b64_json',
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image gen failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned.');
  const dataUrl = `data:image/png;base64,${b64}`;

  // Save persistent data URL; url left blank for legacy compatibility
  STATE.images.push({ url: '', dataUrl, prompt, size, quality, style, at: Date.now() });
  await saveImages();
  renderGallery(galleryEl, { bus });
  bus.emit('log', { tag: 'info', text: 'Image generated.' });
}

export async function updateImagePrefs({ imgStyle, opts }) {
  if (typeof imgStyle === 'string') STATE.imgStyle = imgStyle;
  if (opts) STATE.imgOpts = { ...STATE.imgOpts, ...opts };
  await saveImagePrefs();
}



