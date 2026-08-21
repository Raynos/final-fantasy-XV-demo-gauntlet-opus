import * as THREE from 'three';

/**
 * Unified keyboard / mouse / gamepad input. Exposes an abstract action layer so
 * gameplay code never touches raw key codes.
 *
 * ### Pointer lock
 *
 * Browsers reserve Escape to leave pointer lock and swallow the keydown, so
 * Escape can never be trusted as a UI "back" key while the pointer is held.
 * The rules here exist so that conflict never reaches the player:
 *
 *  - The lock is only ever *requested* from a click that landed on the canvas
 *    itself (`e.target === dom`). A click on a menu row targets a DOM node in
 *    `game.uiRoot`, so opening a menu can no longer steal the pointer.
 *  - `setPointerLockAllowed(false)` releases the lock and refuses to re-take it.
 *    Menus, shops, dialogue and cutscenes assert this while they are up; the
 *    lock is re-acquired by the next canvas click once gameplay resumes, which
 *    is the user gesture browsers insist on.
 *  - An *unexpected* exit (the player hit Escape) raises `lockLost`, which the
 *    menu layer consumes and turns into "open the pause menu" rather than
 *    leaving the player looking at a live world with a dead mouse.
 */
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.pressed = new Set();   // edge: this frame
    this.released = new Set();
    this.move = new THREE.Vector2();     // -1..1 (x = right, y = forward)
    this.look = new THREE.Vector2();     // per-frame delta
    this.pointerLocked = false;
    this.mouse = { left: false, right: false, leftEdge: false, rightEdge: false, wheel: 0 };
    this.enabled = true;

    /** While false, no click may take the pointer and any held lock is dropped. */
    this.pointerLockAllowed = true;
    /** Raised when the lock was dropped while gameplay still wanted it. */
    this.lockLost = false;
    /** Player setting: flip vertical look. */
    this.invertY = false;
    /** Mouse look sensitivity multiplier, 0.25..3. */
    this.lookScale = 1;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Backspace is a back/close key everywhere in the UI; without this the
      // browser treats it as "navigate back" and the page unloads mid-game.
      if (['Space', 'Tab', 'Backspace', 'F1', 'F5'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); this.released.add(e.code); };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.look.x += e.movementX * this.lookScale;
      this.look.y += e.movementY * this.lookScale * (this.invertY ? -1 : 1);
    };
    this._onMouseDown = (e) => {
      // A click that landed on a UI element is the UI's, not the world's: it
      // must neither swing a sword nor grab the pointer.
      if (!this.pointerLocked && e.target !== this.dom) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightEdge = true; }
      this.requestPointerLock();
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this._onWheel = (e) => { this.mouse.wheel += Math.sign(e.deltaY); };
    this._onLock = () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.dom;
      if (was && !this.pointerLocked && this.pointerLockAllowed) this.lockLost = true;
    };
    this._onCtx = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onLock);
    this.dom.addEventListener('contextmenu', this._onCtx);
  }

  key(code) { return this.keys.has(code); }
  keyDown(code) { return this.pressed.has(code); }
  keyUp(code) { return this.released.has(code); }

  /**
   * True this frame for any of the universal "back / close" inputs. Escape is
   * included but never relied upon alone — the browser eats it whenever the
   * pointer is locked, which is exactly when a player most wants to back out.
   */
  backPressed(): boolean {
    return this.keyDown('Escape') || this.keyDown('Backspace') || this.keyDown('Tab');
  }

  /**
   * Gate pointer lock. Called with `false` by anything that puts a cursor-driven
   * or key-driven surface on screen (menus, shops, dialogue, cutscenes).
   */
  setPointerLockAllowed(v: boolean) {
    const want = !!v;
    if (want === this.pointerLockAllowed) return;
    this.pointerLockAllowed = want;
    if (!want) this.releasePointerLock();
  }

  /** Take the pointer, if gameplay is allowed to hold it. Safe to spam. */
  requestPointerLock() {
    if (this.pointerLocked || !this.pointerLockAllowed) return false;
    if (!this.dom || !this.dom.requestPointerLock) return false;
    try {
      const p = this.dom.requestPointerLock();
      // Chrome 113+ returns a promise that rejects if the gesture was stale.
      if (p && p.catch) p.catch(() => {});
    } catch { /* a browser that refuses is not an error worth logging */ }
    return true;
  }

  /** Give the pointer back. */
  releasePointerLock() {
    this.lockLost = false;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  /**
   * Read and clear the "the player pressed Escape out of pointer lock" flag.
   * The menu layer turns this into an open pause menu.
   */
  consumeLockLost(): boolean {
    if (!this.lockLost) return false;
    this.lockLost = false;
    return true;
  }

  /** Gamepad + keyboard fused action state. */
  update() {
    const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    let mx = 0, my = 0;
    if (this.key('KeyD') || this.key('ArrowRight')) mx += 1;
    if (this.key('KeyA') || this.key('ArrowLeft')) mx -= 1;
    if (this.key('KeyW') || this.key('ArrowUp')) my += 1;
    if (this.key('KeyS') || this.key('ArrowDown')) my -= 1;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      mx += dz(gp.axes[0]); my += -dz(gp.axes[1]);
      this.look.x += dz(gp.axes[2] || 0) * 18 * this.lookScale;
      this.look.y += dz(gp.axes[3] || 0) * 18 * this.lookScale * (this.invertY ? -1 : 1);
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.set(mx, my);
    this.gamepad = gp;
    // `enabled` is the engine-wide "gameplay does not own the stick" switch —
    // a menu, a conversation or a downed party raises it. Zeroing the analogue
    // channels here means every consumer honours it without each one having to
    // remember to ask, while discrete `keyDown` reads (which the menus
    // themselves depend on) still work.
    if (this.enabled === false) { this.move.set(0, 0); this.look.set(0, 0); }
  }

  gpButton(i) { return !!(this.gamepad && this.gamepad.buttons[i] && this.gamepad.buttons[i].pressed); }

  /**
   * Rising edge on a gamepad button, tracked internally so several callers can
   * ask about the same button in one frame without stealing it from each other.
   * @param i button index
   */
  gpDown(i: number) {
    // the previous-state table is refreshed once per frame in endFrame(), so
    // every caller in a frame sees the same edge
    return this.gpButton(i) && !(this._gpPrev || (this._gpPrev = []))[i];
  }

  /** Called at the very end of a frame to clear edge state. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.look.set(0, 0);
    this.mouse.leftEdge = false;
    this.mouse.rightEdge = false;
    this.mouse.wheel = 0;
    const prev = this._gpPrev || (this._gpPrev = []);
    for (let i = 0; i < 17; i++) prev[i] = this.gpButton(i);
  }
}
