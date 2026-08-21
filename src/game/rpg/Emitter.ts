/**
 * Minimal synchronous event emitter shared by every RPG subsystem.
 *
 * Deliberately tiny: no wildcards, no async, no once-per-frame batching. RPG
 * events are low frequency (a level-up, a quest step) so a direct call is the
 * cheapest and most debuggable thing we can do. Listener exceptions are caught
 * so one broken HUD widget can never stall the simulation.
 */
export class Emitter {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._handlers = new Map();
    /** Ring buffer of the last emissions — handy for the debug overlay. */
    this.log = [];
    this.logLimit = 64;
  }

  /**
   * Subscribe to an event.
   * @returns unsubscribe function
   */
  on(event: string, fn: (payload:any, event:string)=>void): () => void {
    if (typeof fn !== 'function') throw new TypeError('on(event, fn): fn must be a function');
    let list = this._handlers.get(event);
    if (!list) { list = []; this._handlers.set(event, list); }
    list.push(fn);
    return () => this.off(event, fn);
  }

  /** Subscribe and auto-unsubscribe after the first emission. */
  once(event, fn) {
    const off = this.on(event, (payload, ev) => { off(); fn(payload, ev); });
    return off;
  }

  /** Remove a previously registered handler. */
  off(event, fn) {
    const list = this._handlers.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this._handlers.delete(event);
  }

  /**
   * Fire an event. Returns the payload so call sites can `return this.emit(...)`.
   */
  emit(event: string, payload?: any) {
    this.log.push({ event, payload, t: Date.now() });
    if (this.log.length > this.logLimit) this.log.shift();
    const list = this._handlers.get(event);
    if (list) {
      // copy: handlers are allowed to unsubscribe during dispatch
      for (const fn of list.slice()) {
        try { fn(payload, event); } catch (err) { console.error(`[rpg] handler for "${event}" threw`, err); }
      }
    }
    const any = this._handlers.get('*');
    if (any) for (const fn of any.slice()) {
      try { fn(payload, event); } catch (err) { console.error('[rpg] wildcard handler threw', err); }
    }
    return payload;
  }

  /** Drop every listener (used when tearing a save down). */
  clear() { this._handlers.clear(); }
}
