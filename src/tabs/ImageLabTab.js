import { STATE } from '../core/state.js';
import { promptFromChatWithStyle } from '../core/openai.js';
import { generateImageAndShow, renderGallery, updateImagePrefs } from '../core/images.js';

export function ImageLabTab({ bus }) {
  const wrap = document.createElement('section');
  wrap.innerHTML = `
    <h3>Image Lab</h3>

    <label>Style recipe</label><br />
    <textarea id="l2rImgStyle" class="inp" placeholder="How to stylize prompts..." rows="5"></textarea>

    <div class="l2r-grid">
      <div>
        <label>Aspect</label>
        <select id="l2rImgAspect" class="inp">
          <option value="1024x1024">Square (1024×1024)</option>
          <option value="1792x1024">Landscape (1792×1024)</option>
          <option value="1024x1792">Portrait (1024×1792)</option>
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
        <input id="l2rImgModel" class="inp" placeholder="dall-e-3" disabled />
      </div>
    </div>

    <div class="l2r-row" style="margin-top:8px;">
      <button id="l2rGenFromChat" class="btn">Generate from recent chat</button>
    </div>
    <input id="l2rImgPrompt" class="inp" placeholder="(Optional) custom image prompt..." />

    <div class="l2r-row" style="justify-content: flex-end; margin-top:6px;">
      <button id="l2rClearImages" class="btn mini">Clear gallery</button>
    </div>

    <div id="l2rGallery" class="l2r-gallery"></div>
  `;

  const imgStyleEl = wrap.querySelector('#l2rImgStyle');
  const imgAspect = wrap.querySelector('#l2rImgAspect');
  const imgQuality = wrap.querySelector('#l2rImgQuality');
  const imgStyleMod = wrap.querySelector('#l2rImgStyleMode');
  const imgModel = wrap.querySelector('#l2rImgModel');
  const imgFromChat = wrap.querySelector('#l2rGenFromChat');
  const imgPrompt = wrap.querySelector('#l2rImgPrompt');
  const imgClear = wrap.querySelector('#l2rClearImages');
  const gallery = wrap.querySelector('#l2rGallery');

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

  const genImage = async () => {
    try {
      bus.emit('log', { tag: 'info', text: 'Building image prompt from recent chat...' });
      const prompt = await promptFromChatWithStyle();
      if (!prompt) { bus.emit('log', { tag: 'warn', text: 'Prompt came back empty.' }); return; }
      imgPrompt.value = prompt;
      await generateImageAndShow({ prompt, bus, galleryEl: gallery });
    } catch (e) {
      bus.emit('log', { tag: 'error', text: String(e) });
    }
  };

  imgFromChat.addEventListener('click', genImage);

  imgClear.addEventListener('click', async () => {
    STATE.images = [];
    await import('../core/state.js').then(m => m.saveImages());
    renderGallery(gallery, { bus });
    bus.emit('log', { tag: 'info', text: 'Image gallery cleared.' });
  });

  renderGallery(gallery, { bus });
  return wrap;
}
