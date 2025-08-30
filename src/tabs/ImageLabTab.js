/* eslint-disable no-undef */
import { STATE, saveImages } from '../core/state.js';
import { promptFromChatWithStyleLLM } from '../core/llmClient.js';
import { generateImageAndShow, renderGallery, updateImagePrefs } from '../core/images.js';
import { NavTabs } from '../ui/NavTabs.js';
import { storage } from '../core/storage.js';

export function ImageLabTab({ bus }) {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <h3>Image Lab</h3>
    <div id="l2rImgTabs"></div>
  `;

  const host = wrap.querySelector('#l2rImgTabs');
  let galleryRef = null;

  function GenTab() {
    const s = document.createElement('section');
    s.innerHTML = `
    <div class="l2r-row" style="margin-top:8px;">
        <button id="l2rGenFromChat" class="btn">Build prompt from recent chat</button>
      </div>
      <textarea id="l2rImgPrompt" class="inp" rows="6" placeholder="(Optional) custom image prompt..."></textarea>
      <div class="l2r-row" style="justify-content: flex-end; margin-top:6px;">
        <button id="l2rGenNow" class="btn">Generate</button>
      </div>`;
    const genBtn = s.querySelector('#l2rGenFromChat');
    const genNow = s.querySelector('#l2rGenNow');
    const imgPrompt = s.querySelector('#l2rImgPrompt');
    genBtn.addEventListener('click', async () => {
      try {
        bus.emit('log', { tag: 'info', text: 'Building image prompt from recent chat...' });
        const prompt = await promptFromChatWithStyleLLM();
        if (!prompt) { bus.emit('log', { tag: 'warn', text: 'Prompt came back empty.' }); return; }
        imgPrompt.value = prompt;
      } catch (e) { bus.emit('log', { tag: 'error', text: String(e) }); }
    });
    genNow.addEventListener('click', async () => {
      const prompt = (imgPrompt.value || '').trim();
      if (!prompt) { bus.emit('log', { tag: 'warn', text: 'Enter or build a prompt first.' }); return; }
      await generateImageAndShow({ prompt, bus, galleryEl: galleryRef });
    });
    return s;
  }

  function StylesTab() {
    const s = document.createElement('section');
    s.innerHTML = `
    <label>Style recipe</label><br />
      <textarea id="l2rImgStyle" class="inp" placeholder="How to stylize prompts..." rows="5"></textarea>
      <div class="l2r-grid">
        <div>
          <label>Aspect</label>
          <select id="l2rImgAspect" class="inp">
            <option value="1024x1024">Square (1024x1024)</option>
            <option value="1792x1024">Landscape (1792x1022)</option>
            <option value="1024x1792">Portrait (1024x1792)</option>
          </select>
        </div>
        <div>
          <label>Quality</label>
          <select id="l2rImgQuality" class="inp">
            <option value="standard">standard</option>
            <option value="hd">hd</option>
          </select>
        </div>
        <div>
          <label>Style</label><br />
          <select id="l2rImgStyleMode" class="inp">
            <option value="vivid">vivid</option>
            <option value="natural">natural</option>
          </select>
        </div>
        <div>
          <label>Custom model</label>
          <input id="l2rImgModel" class="inp" placeholder="dall-e-3" />
        </div>
      </div>`;
    const imgStyleEl = s.querySelector('#l2rImgStyle');
    const imgAspect = s.querySelector('#l2rImgAspect');
    const imgQuality = s.querySelector('#l2rImgQuality');
    const imgStyleMod = s.querySelector('#l2rImgStyleMode');
    const imgModel = s.querySelector('#l2rImgModel');
    imgStyleEl.value = STATE.imgStyle;
    imgAspect.value = STATE.imgOpts.size;
    imgQuality.value = STATE.imgOpts.quality;
    imgStyleMod.value = STATE.imgOpts.style;
    imgModel.value = STATE.imgOpts.model;
    imgStyleEl.addEventListener('change', () => updateImagePrefs({ imgStyle: imgStyleEl.value }));
    imgAspect.addEventListener('change', () => updateImagePrefs({ opts: { size: imgAspect.value } }));
    imgQuality.addEventListener('change', () => updateImagePrefs({ opts: { quality: imgQuality.value } }));
    imgStyleMod.addEventListener('change', () => updateImagePrefs({ opts: { style: imgStyleMod.value } }));
    imgModel.addEventListener('change', () => updateImagePrefs({ opts: { model: (imgModel.value || 'dall-e-3').trim() } }));
    return s;
  }

  function GalleryTab() {
    const s = document.createElement('section');
    s.innerHTML = `
    <div class="l2r-row" style="justify-content: flex-end; margin-top:6px;">
        <button id="l2rRefreshGallery" class="btn mini">Refresh</button> <button id="l2rClearImages" class="btn mini">Clear gallery</button>
      </div>
      <div id="l2rGallery" class="l2r-gallery"></div>`;
    const imgRefresh = s.querySelector('#l2rRefreshGallery');
    const imgClear = s.querySelector('#l2rClearImages');
    const gallery = s.querySelector('#l2rGallery');
    galleryRef = gallery;
    imgRefresh.addEventListener('click', () => renderGallery(gallery, { bus }));
    imgClear.addEventListener('click', async () => {
      STATE.images = [];
      await saveImages();
      renderGallery(gallery, { bus });
      bus.emit('log', { tag: 'info', text: 'Image gallery cleared.' });
    });
    renderGallery(gallery, { bus });
    return s;
  }

  const tabs = [
    { id: 'gen', title: 'Generate', render: () => GenTab() },
    { id: 'styles', title: 'Styles', render: () => StylesTab() },
    { id: 'gallery', title: 'Gallery', render: () => GalleryTab() },
  ];
  const view = NavTabs({ tabs, activeId: 'gen', onChange: (id) => { try { chrome?.storage?.local?.set({ L2R_IMAGELAB_ACTIVE_TAB: id }); } catch {} } });
  host.appendChild(view);
  try { chrome.storage.local.get(['L2R_IMAGELAB_ACTIVE_TAB'], v => { const want=v?.L2R_IMAGELAB_ACTIVE_TAB||'gen'; const bar=host.querySelector('.l2r-tabs'); const btn=Array.from(bar?.querySelectorAll('button')||[]).find(b => (b.textContent||'').toLowerCase().includes(want)); btn?.click(); }); } catch {}
  // live refresh when images update
  bus?.on?.('images:updated', () => { if (galleryRef) renderGallery(galleryRef, { bus }); });

  return wrap;
}









