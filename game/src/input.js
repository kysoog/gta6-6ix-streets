// Input: WASD/arrows + mouse aim via pointer lock. One input snapshot per frame; main.js reads it.
// Bindings:
//   WASD / arrows   move on foot or in a car
//   Shift           run on foot / handbrake in a car
//   Space           handbrake
//   F               enter or exit the nearest vehicle; press also requests pointer lock
//   H               horn (beeps once on press, repeats while held)
//   R               cycle the radio station (repeats while held); when wasted, R restarts
//   P               pause / resume
//   Escape          leave pointer lock and pause
// Key repeat: H and R start repeating after REPEAT_DELAY seconds, then every REPEAT_INTERVAL
// seconds; repeats surface as justHorn / justRadio on top of the first-press flags.
export const REPEAT_DELAY = 0.35;
export const REPEAT_INTERVAL = 0.08;

export function createInput(element) {
  const state = {
    forward: false, back: false, left: false, right: false, run: false,
    enter: false, exit: false, shoot: false, restart: false, pause: false,
    handbrake: false, horn: false, radio: false,
    camYaw: 0, camPitch: 0, pointerLocked: false,
    justShot: false, justEnter: false, justExit: false, justRestart: false, justPause: false,
    justHorn: false, justRadio: false,
  };
  let pointerLockRequested = false;
  let mouseX = 0, mouseY = 0;
  const repeat = {}; // code -> { start: seconds, next: seconds }

  function onKey(event, pressed) {
    const code = event.code;
    switch (code) {
      case 'KeyW': case 'ArrowUp': state.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': state.back = pressed; break;
      case 'KeyA': case 'ArrowLeft': state.left = pressed; break;
      case 'KeyD': case 'ArrowRight': state.right = pressed; break;
      case 'ShiftLeft': case 'ShiftRight': state.run = pressed; break;
      case 'Space': state.handbrake = pressed; break;
      case 'KeyF': if (pressed && !state.enter) { state.enter = true; state.justEnter = true; } else if (!pressed) state.enter = false; break;
      case 'KeyX': if (pressed && !state.exit) { state.exit = true; state.justExit = true; } else if (!pressed) state.exit = false; break;
      case 'KeyR': if (pressed && !state.radio) { state.radio = true; state.justRadio = true; } else if (!pressed) state.radio = false; break;
      case 'KeyH': state.horn = pressed; if (pressed) state.justHorn = true; break;
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
      const now = performance.now() / 1000;
      const sensitivity = 0.0018;
      state.camYaw -= mouseX * sensitivity;
      state.camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, state.camPitch - mouseY * sensitivity));
      mouseX = 0; mouseY = 0;
      state.justShot = false; state.justEnter = false; state.justExit = false; state.justRestart = false; state.justPause = false;
      state.justHorn = false; state.justRadio = false;
      // Autorepeat for held horn and radio keys.
      const held = (code, flag) => {
        let entry = repeat[code];
        if (!entry) { entry = { start: now, next: now }; repeat[code] = entry; }
        if (now >= entry.next) { state[flag] = true; entry.next = now + REPEAT_INTERVAL; }
      };
      if (state.horn) held('KeyH', 'justHorn'); else delete repeat['KeyH'];
      if (state.radio) held('KeyR', 'justRadio'); else delete repeat['KeyR'];

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
