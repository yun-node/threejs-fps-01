// input.js — keyboard + mouse state and pointer lock. One job: raw input only.
export function createInput(canvas) {
  const keys = new Set();
  const inp = {
    keys, mouseDX: 0, mouseDY: 0, mouseDown: false, mouseDownR: false,
    locked: false, pressed: new Set(), // keys pressed since last consume
  };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    inp.pressed.add(e.code);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); inp.mouseDown = false; });
  document.addEventListener('mousemove', (e) => {
    if (!inp.locked) return;
    inp.mouseDX += e.movementX;
    inp.mouseDY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!inp.locked) return;
    if (e.button === 0) inp.mouseDown = true;
    if (e.button === 2) inp.mouseDownR = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) inp.mouseDown = false;
    if (e.button === 2) inp.mouseDownR = false;
  });
  document.addEventListener('pointerlockchange', () => {
    inp.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  inp.requestLock = () => {
    if (document.pointerLockElement !== canvas) {
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* headless: no lock */ }
    }
  };
  inp.consumeMouse = () => {
    const dx = inp.mouseDX, dy = inp.mouseDY;
    inp.mouseDX = 0; inp.mouseDY = 0;
    return { dx, dy };
  };
  inp.wasPressed = (code) => {
    if (inp.pressed.has(code)) { inp.pressed.delete(code); return true; }
    return false;
  };
  inp.endFrame = () => inp.pressed.clear();
  return inp;
}
