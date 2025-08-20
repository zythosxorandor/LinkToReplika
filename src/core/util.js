export const clip = (str, n = 6000) => (!str ? '' : (str.length > n ? str.slice(0, n) + '…' : str));

export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function makeDraggable(handle, host) {
  let dragging = false, sx = 0, sy = 0, startRight = 14, startBottom = 14;
  const onDown = (e) => {
    dragging = true; sx = e.clientX; sy = e.clientY;
    startRight = parseFloat(host.style.right || '14');
    startBottom = parseFloat(host.style.bottom || '14');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    host.style.right = `${Math.max(0, startRight - dx)}px`;
    host.style.bottom = `${Math.max(0, startBottom + dy)}px`;
  };
  const onUp = () => {
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  handle.addEventListener('mousedown', onDown);
}
