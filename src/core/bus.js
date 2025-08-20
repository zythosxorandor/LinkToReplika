export function createBus() {
  const map = new Map();
  return {
    on(evt, fn) { (map.get(evt) || map.set(evt, new Set()).get(evt)).add(fn); return () => this.off(evt, fn); },
    off(evt, fn) { const s = map.get(evt); if (s) s.delete(fn); },
    emit(evt, payload) { const s = map.get(evt); if (s) for (const fn of s) fn(payload); },
  };
}
