import * as THREE from 'three';

/**
 * Unified keyboard / mouse / gamepad input. Exposes an abstract action layer so
 * gameplay code never touches raw key codes.
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

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab', 'F1', 'F5'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); this.released.add(e.code); };
    this._onMouseMove = (e) => {
      if (this.pointerLocked) { this.look.x += e.movementX; this.look.y += e.movementY; }
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightEdge = true; }
      if (!this.pointerLocked && this.dom.requestPointerLock) this.dom.requestPointerLock();
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this._onWheel = (e) => { this.mouse.wheel += Math.sign(e.deltaY); };
    this._onLock = () => { this.pointerLocked = document.pointerLockElement === this.dom; };
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
      this.look.x += dz(gp.axes[2] || 0) * 18;
      this.look.y += dz(gp.axes[3] || 0) * 18;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.set(mx, my);
    this.gamepad = gp;
  }

  gpButton(i) { return !!(this.gamepad && this.gamepad.buttons[i] && this.gamepad.buttons[i].pressed); }

  /** Called at the very end of a frame to clear edge state. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.look.set(0, 0);
    this.mouse.leftEdge = false;
    this.mouse.rightEdge = false;
    this.mouse.wheel = 0;
  }
}
