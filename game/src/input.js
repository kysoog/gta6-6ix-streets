// Input: WASD/arrows + mouse aim via pointer lock. One input snapshot per frame; main.js reads it.
// Escape leaves pointer lock and pauses; there is no other UI that steals the keyboard.
export function createInput(element) {
  const keys = {};
  const state = {
    forward: false, back: false, left: false, right: false, run: false,
    enter: false, exit: false, shoot: false,    restart: false, pause: false,
    handbrake: false,
    camYaw: 0, camPitch: 0, pointerLocked: false,
    justShot: false, justEnter: false, justRestart: false, justPause: false,
  };
  let pointerLockRequested = false;
  let mouseX = 0, mouseY = 0;

  function onKey(event, pressed) {
    const code = event.code;
    switch (code) {
      case 'KeyW': case 'ArrowUp': state.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': state.back = pressed; break;
      case 'KeyA': case 'ArrowLeft': state.left = pressed; break;
      case 'KeyD': case 'ArrowRight': state.right = pressed; break;
      case 'ShiftLeft': case 'ShiftRight': state.run = pressed; break;
      case 'Space': if (pressed) state.handbrake = true; else state.handbrake = false; break;
      case 'KeyF': if (pressed && !state.enter) { state.enter = true; state.justEnter = true; } else if (!pressed) state.enter = false; break;
      case 'KeyX': if (pressed && !state.exit) { state.exit = true; state.justExit = true; } else if (!pressed) state.exit = false; break;
      case 'KeyR': if (pressed && !state.restart) { state.restart = true; state.justRestart = true; } else if (!pressed) state.restart = false; break;
      case 'KeyP': if (pressed && !state.pause) { state.pause = true; state.justPause = true; } else if (!pressed) state.pause = false; break;
      case 'KeyQ': if (pressed) state.quit = true; break;
      default:
    }
    if (code === 'KeyF' && pressed) element.requestPointerLock?.();
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  window.addEventListener('mousedown', (e) => { if (e.button === 0) state.shoot = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.shoot = false; });
  window.addEventListener('mousemove', (e) => {
    mouseX += e.movementX; mouseY += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === element;
    if (!state.pointerLocked) mouseX = mouseY = 0;
  });
  document.addEventListener('pointerlockerror', () => {
    state.pointerLocked = false;
  });

  return {
    read() {
      const sensitivity = 0.0018;
      state.camYaw -= mouseX * sensitivity;
      state.camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, state.camPitch - mouseY * sensitivity));
      mouseX = 0; mouseY = 0;
      state.justShot = false; state.justEnter = false; state.justExit = false; state.justRestart = false; state.justPause = false;
      const shoot = state.shoot;
      state.shoot = false;
      return { ...state, shoot };
    },
    get state() { return state; },
    requestPointerLock() { element.requestPointerLock?.(); },
    exitPointerLock() { document.exitPointerLock?.(); },
    isLocked() { return state.pointerLocked; },
  };
}
