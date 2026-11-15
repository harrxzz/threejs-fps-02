// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain browser
// APIs only: the game asks the canvas for pointer lock and reads movementX/Y while it holds it.
// Edge detection lives here too: `pressed(code)` is true only on the frame the key went down,
// so main.js can treat B/G/E/R/1-5 as actions instead of held states.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const justPressed = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0, wheel: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) justPressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('wheel', (event) => {
    if (!state.locked) return;
    state.wheel += event.deltaY > 0 ? 1 : -1;
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takeWheel() {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    },
    pressed(code) {
      // Consume-on-read: a fixed step runs up to five times a frame, and a key pressed
      // once must fire its action once, not once per step.
      if (justPressed.has(code)) {
        justPressed.delete(code);
        return true;
      }
      return false;
    },
    endFrame(simulated = true) {
      if (simulated) justPressed.clear();
    },
  };
}
