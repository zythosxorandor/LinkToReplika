/* eslint-disable no-undef */
export const storage = {
  async get(keys) {
    return new Promise((res) => chrome.storage?.local?.get(keys, res));
  },
  async set(obj) {
    return new Promise((res) => chrome.storage?.local?.set(obj, res));
  },
};
