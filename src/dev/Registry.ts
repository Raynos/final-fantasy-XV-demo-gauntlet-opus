/**
 * The command + cvar registry: the substrate every other part of the dev suite
 * is a view over.
 *
 * The ordering here is deliberate and is the one lesson every mature toolset
 * teaches (Unreal's `IConsoleManager`, Quake/Source cvars, Dear ImGui suites):
 * **register the capability first, surface it second.** Build the GUI first and
 * you end up with capabilities that cannot be scripted, keybound, or recorded
 * into a bug report. Register first and the console, the panels, the keybinds,
 * the presets and the repro script in every review note all fall out of the
 * same table for free.
 *
 * Two kinds of entry:
 *   - **cvar** — a named value with `get`/`set` and optional `min`/`max`/`choices`.
 *     `defaultOf()` snapshots the boot value so `deltas()` can report exactly
 *     what the reviewer changed.
 *   - **command** — a named action taking a string argument list.
 *
 * `deltas()` is the reason the default is captured at registration. The most
 * expensive failure mode of a debug suite is chasing a bug that turns out to be
 * a leftover toggle, so a note records every value that differs from boot and
 * the overlay watermarks itself once anything does.
 */

/**
 * What a cvar can hold.
 *
 * The console only ever hands over strings, so `Registry.set` coerces against
 * the *boot* value's type -- which is why this is a closed union rather than
 * `unknown`: the coercion has to be able to enumerate the cases.
 */
export type CvarValue = string | number | boolean;

/**
 * A console variable: a named getter/setter pair with a range the UI can draw.
 *
 * `get`/`set` are declared as **methods** rather than function properties on
 * purpose. A `number` cvar is registered with `set: (v: number) => void` and
 * has to live in one `Map` next to the boolean and string ones; method
 * declarations are checked bivariantly, which is what lets that heterogeneous
 * table exist without every registration widening its own setter to the union.
 */
export interface Cvar<T extends CvarValue = CvarValue> {
  name: string;
  category: string;
  help: string;
  get(): T;
  /** Takes whatever `get` returns, or the coerced form of a console string. */
  set(v: T): void;
  min?: number;
  max?: number;
  step?: number;
  choices?: readonly string[];
  /** Hidden unless cheats are on. */
  cheat?: boolean;
}
/** A console command. */
export interface Command {
  name: string;
  category: string;
  help: string;
  /** Usage string shown in help. */
  args?: string;
  /**
   * Run it. The whole argument tail arrives as one string; anything returned
   * is printed, and a throw is caught and printed as the error. A command that
   * has to await something prints its own result through `DevConsole` instead.
   */
  exec(args: string): string | void | Promise<string | void>;
}

/** One cvar that has moved off its boot value. */
export interface CvarDelta {
  is: CvarValue;
  was: CvarValue | undefined;
}

export class Registry {
  cmds!: Map<string, Command>;
  cvars!: Map<string, Cvar>;
  /** Boot value per cvar name, snapshotted at registration. */
  defaults!: Map<string, CvarValue>;
  /** Ring buffer of executed command lines. */
  history!: string[];
  constructor() {
    this.cvars = new Map();
    this.cmds = new Map();
    this.defaults = new Map();
    /** Ring buffer of executed command lines; rides along in every review note. */
    this.history = [];
  }

  /**
   * Register a tunable value.
   */
  cvar<T extends CvarValue>(spec: Cvar<T>) {
    this.cvars.set(spec.name, spec);
    // Snapshot at registration, not at first read: a value read later may
    // already have been changed, and then `deltas()` would report nothing.
    try { this.defaults.set(spec.name, spec.get()); } catch { /* not ready yet */ }
    return this;
  }

  /**
   * Register an action.
   */
  cmd(spec: Command) {
    this.cmds.set(spec.name, spec);
    return this;
  }

  /** @param name @returns */
  get(name: string): CvarValue | undefined {
    const c = this.cvars.get(name);
    return c ? c.get() : undefined;
  }

  /**
   * Set a cvar, coercing the string form the console hands us into the type the
   * current value implies. Without this, `post.bloom false` would store the
   * seven-character string `"false"`, which is truthy.
   * @param name @param value
   */
  set(name: string, value: string) {
    const c = this.cvars.get(name);
    if (!c) throw new Error(`unknown cvar: ${name}`);
    let v: string | number | boolean = value;
    if (typeof value === 'string') {
      const cur = this.defaults.has(name) ? this.defaults.get(name) : c.get();
      if (typeof cur === 'boolean') v = value !== 'false' && value !== '0' && value !== '';
      else if (typeof cur === 'number') v = Number(value);
    }
    if (typeof v === 'number') {
      if (c.min != null) v = Math.max(c.min, v);
      if (c.max != null) v = Math.min(c.max, v);
      if (!Number.isFinite(v)) throw new Error(`${name}: not a number`);
    }
    c.set(v);
    return v;
  }

  /**
   * Run one console line: `<name> [args...]`. A bare cvar name prints it; a
   * cvar with arguments assigns it; a command name always runs.
   * @returns human-readable result for the console log
   */
  exec(line: string): string {
    const src = String(line || '').trim();
    if (!src) return '';
    this.history.push(src);
    if (this.history.length > 64) this.history.shift();

    const sp = src.indexOf(' ');
    const name = sp < 0 ? src : src.slice(0, sp);
    const rest = sp < 0 ? '' : src.slice(sp + 1).trim();

    const cmd = this.cmds.get(name);
    if (cmd) {
      const out = cmd.exec(rest);
      // An async command reports through `DevConsole.print` when it lands.
      // Before this check the pending promise went through `String()` and the
      // console printed the literal text `[object Promise]`.
      if (out instanceof Promise) return `${name}: working…`;
      return out == null ? `${name}: ok` : String(out);
    }
    const cv = this.cvars.get(name);
    if (cv) {
      if (!rest) return `${name} = ${JSON.stringify(cv.get())}`;
      return `${name} = ${JSON.stringify(this.set(name, rest))}`;
    }
    return `unknown: ${name} — try 'help'`;
  }

  /**
   * Every cvar whose live value differs from its boot value.
   *
   * Stamped into review notes so a reader can tell at a glance whether the
   * report was filed from a tampered state.
   */
  deltas(): Record<string, CvarDelta> {
    const out: Record<string, CvarDelta> = {};
    for (const [name, c] of this.cvars) {
      const was = this.defaults.get(name);
      let is: CvarValue;
      try { is = c.get(); } catch { continue; }
      if (JSON.stringify(is) !== JSON.stringify(was)) out[name] = { is, was };
    }
    return out;
  }

  /** Restore every cvar to the value it had at boot. */
  reset() {
    for (const [name, c] of this.cvars) {
      const boot = this.defaults.get(name);
      if (boot === undefined) continue;
      try { c.set(boot); } catch { /* transient system */ }
    }
  }

  /**
   * Names matching a prefix, for console autocomplete.
   * @param prefix @returns 
   */
  complete(prefix: string): string[] {
    const p = String(prefix || '');
    const all = [...this.cmds.keys(), ...this.cvars.keys()];
    return all.filter((n) => n.startsWith(p)).sort();
  }

  /** Grouped listing for `help` and for building panels. */
  byCategory() {
    const out: Map<string, {cvars:Cvar[], cmds:Command[]}> = new Map();
    const bucket = (k: string) => {
      if (!out.has(k)) out.set(k, { cvars: [], cmds: [] });
      return out.get(k);
    };
    for (const c of this.cvars.values()) bucket(c.category || 'misc')!.cvars.push(c);
    for (const c of this.cmds.values()) bucket(c.category || 'misc')!.cmds.push(c);
    return out;
  }
}
