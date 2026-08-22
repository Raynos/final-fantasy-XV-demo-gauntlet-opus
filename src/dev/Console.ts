import type { Registry } from './Registry.ts';
/**
 * Console overlay over the {@link Registry}.
 *
 * This is the discoverability layer: `help` lists every capability the suite
 * has, Tab completes, and the up arrow walks history. Because every capability
 * is a registered name rather than a hard-wired button, the exact sequence a
 * reviewer typed can be replayed — and it rides along in every review note as
 * the repro script.
 *
 * Keystrokes are stopped at the input element rather than at `window`. The
 * engine's `Input` listens on `window`, so without `stopPropagation()` typing
 * `warp cape_caem` would also strafe the freecam and swing a sword. Stopping in
 * the bubble phase at the target keeps the event from ever reaching it.
 */
export class DevConsole {
  hist!: any[];
  histAt!: number;
  input!: any;
  log!: any;
  node!: HTMLDivElement;
  open!: boolean;
  reg!: Registry;
  constructor(root: HTMLElement, reg: import('./Registry.ts').Registry) {
    this.reg = reg;
    this.open = false;
    this.hist = [];
    this.histAt = -1;

    this.node = document.createElement('div');
    this.node.className = 'dev-console';
    this.node.innerHTML = `
      <div class="dev-log"></div>
      <div class="dev-input-row"><span>&gt;</span><input type="text" spellcheck="false" autocomplete="off"></div>`;
    root.appendChild(this.node);

    this.log = this.node.querySelector('.dev-log');
    this.input = this.node.querySelector('input');
    this.node.style.display = 'none';

    this.input.addEventListener('keydown', (e: any) => this._onKey(e));
    // Any key typed into the console belongs to the console, full stop.
    this.input.addEventListener('keyup', (e: any) => e.stopPropagation());
    this.input.addEventListener('keypress', (e: any) => e.stopPropagation());

    this.print('dev console — `help` lists everything, Tab completes.', 'dim');
  }

  setOpen(v: boolean) {
    this.open = !!v;
    this.node.style.display = this.open ? '' : 'none';
    if (this.open) { this.input.focus(); this.input.select(); }
    else this.input.blur();
  }

  toggle() { this.setOpen(!this.open); }

  /** @param text @param [cls] */
  print(text: string, cls?: string) {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    this.log.appendChild(line);
    while (this.log.childElementCount > 200) this.log.removeChild(this.log.firstChild);
    this.log.scrollTop = this.log.scrollHeight;
  }

  _onKey(e: any) {
    e.stopPropagation();

    if (e.key === 'Escape' || e.key === '`') { e.preventDefault(); this.setOpen(false); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      const v = this.input.value;
      // Complete the command name only — arguments are values, not names, and
      // completing them would fight the user.
      if (v.includes(' ')) return;
      const hits = this.reg.complete(v);
      if (!hits.length) return;
      if (hits.length === 1) { this.input.value = `${hits[0]} `; return; }
      // Extend to the longest shared prefix, then show the candidates. This is
      // what a shell does and what everyone's fingers already expect.
      let pre = hits[0];
      for (const h of hits) { while (!h.startsWith(pre)) pre = pre.slice(0, -1); }
      if (pre.length > v.length) this.input.value = pre;
      this.print(hits.join('  '), 'dim');
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.hist.length) return;
      if (this.histAt < 0) this.histAt = this.hist.length;
      this.histAt += e.key === 'ArrowUp' ? -1 : 1;
      this.histAt = Math.max(0, Math.min(this.hist.length, this.histAt));
      this.input.value = this.hist[this.histAt] || '';
      return;
    }

    if (e.key !== 'Enter') return;
    e.preventDefault();
    const line = this.input.value.trim();
    this.input.value = '';
    this.histAt = -1;
    if (!line) return;
    this.hist.push(line);
    this.print(`> ${line}`, 'echo');
    try {
      const out = this.reg.exec(line);
      if (out) this.print(out);
    } catch (err: any) {
      this.print(String((err && err.message) || err), 'err');
    }
  }

  /** Register `help` and `dump` against a registry. Called by DevSuite. */
  installHelp() {
    const reg = this.reg;
    reg.cmd({
      name: 'help',
      category: 'console',
      args: '[prefix]',
      help: 'list commands and cvars',
      exec: (arg: any) => {
        const cats = reg.byCategory();
        const want = String(arg || '').trim();
        for (const [cat, { cvars, cmds }] of [...cats].sort()) {
          const lines = [];
          for (const c of cmds) {
            if (want && !c.name.startsWith(want)) continue;
            lines.push(`  ${c.name}${c.args ? ` ${c.args}` : ''} — ${c.help}`);
          }
          for (const c of cvars) {
            if (want && !c.name.startsWith(want)) continue;
            let v; try { v = JSON.stringify(c.get()); } catch { v = '?'; }
            lines.push(`  ${c.name} = ${v} — ${c.help}`);
          }
          if (lines.length) { this.print(`[${cat}]`, 'dim'); lines.forEach((l) => this.print(l)); }
        }
        return '';
      },
    });
    reg.cmd({
      name: 'dump',
      category: 'console',
      help: 'print every cvar changed from its boot value',
      exec: () => {
        const d = reg.deltas();
        const keys = Object.keys(d);
        if (!keys.length) return 'no cvars changed from boot';
        return keys.map((k) => `${k} = ${JSON.stringify(d[k].is)} (was ${JSON.stringify(d[k].was)})`).join('\n');
      },
    });
  }
}
