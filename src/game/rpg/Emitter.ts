/**
 * Minimal synchronous event emitter shared by every RPG subsystem.
 *
 * Deliberately tiny: no wildcards, no async, no once-per-frame batching. RPG
 * events are low frequency (a level-up, a quest step) so a direct call is the
 * cheapest and most debuggable thing we can do. Listener exceptions are caught
 * so one broken HUD widget can never stall the simulation.
 */
/**
 * A listener. The payload type is whatever the handler says it is -- the
 * emitter itself carries no schema, so the annotation on the callback is the
 * contract, and it is checked against what the emitting site actually sends
 * only where both sides are typed.
 */
export type EmitterHandler<P = unknown> = (payload: P, event: string) => void;

/** One line of the ring buffer the debug overlay reads. */
export interface EmitterLogEntry {
  event: string;
  payload: unknown;
  /** `Date.now()`. */
  t: number;
}

export class Emitter {
  _handlers!: Map<string, EmitterHandler<never>[]>;
  log!: EmitterLogEntry[];
  logLimit!: number;
  constructor() {
    this._handlers = new Map();
    /** Ring buffer of the last emissions — handy for the debug overlay. */
    this.log = [];
    this.logLimit = 64;
  }

  /**
   * Subscribe to an event.
   * @returns unsubscribe function
   */
  on<P = unknown>(event: string, fn: EmitterHandler<P>): () => void {
    if (typeof fn !== 'function') throw new TypeError('on(event, fn): fn must be a function');
    let list = this._handlers.get(event);
    if (!list) { list = []; this._handlers.set(event, list); }
    list.push(fn as EmitterHandler<never>);
    return () => this.off(event, fn as EmitterHandler<never>);
  }

  /** Subscribe and auto-unsubscribe after the first emission. */
  once<P = unknown>(event: string, fn: EmitterHandler<P>) {
    const off = this.on<P>(event, (payload, ev) => { off(); fn(payload, ev); });
    return off;
  }

  /** Remove a previously registered handler. */
  off(event: string, fn: EmitterHandler<never>) {
    const list = this._handlers.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this._handlers.delete(event);
  }

  /**
   * Fire an event. Returns the payload so call sites can `return this.emit(...)`.
   */
  emit<P>(event: string, payload?: P): P | undefined {
    this.log.push({ event, payload, t: Date.now() });
    if (this.log.length > this.logLimit) this.log.shift();
    const call = (fn: EmitterHandler<never>) => (fn as EmitterHandler<P | undefined>)(payload, event);
    const list = this._handlers.get(event);
    if (list) {
      // copy: handlers are allowed to unsubscribe during dispatch
      for (const fn of list.slice()) {
        try { call(fn); } catch (err) { console.error(`[rpg] handler for "${event}" threw`, err); }
      }
    }
    // The `'*'` wildcard the class doc says does not exist. It does, and the
    // debug overlay is the only thing that has ever subscribed to it.
    const every = this._handlers.get('*');
    if (every) for (const fn of every.slice()) {
      try { call(fn); } catch (err) { console.error('[rpg] wildcard handler threw', err); }
    }
    return payload;
  }

  /** Drop every listener (used when tearing a save down). */
  clear() { this._handlers.clear(); }
}
