import { capture, gather } from './Report.ts';
import type { ReviewNote } from './Report.ts';
import type { Registry } from './Registry.ts';
import type { Game } from '../game/Game.ts';

const SEVERITY = ['blocker', 'major', 'minor', 'polish'];
const AREA = ['terrain', 'vegetation', 'characters', 'enemies', 'combat', 'ui', 'camera', 'audio', 'perf', 'world', 'other'];

/**
 * The feedback loop: see something wrong, press a key, type a sentence, and it
 * lands on disk as JSON + PNG that an agent can act on without you writing a
 * prompt.
 *
 * The frame is captured **the instant the key is pressed**, before the note
 * panel opens. Capturing after would photograph the note panel instead of the
 * defect, which is the single most common way in-game bug reporters ship
 * useless screenshots.
 *
 * Writes through `POST /__review/note` (see `src/tools/vite-plugin-review.mts`),
 * which is registered on both the dev and preview servers. If neither is there
 * — a static build opened off the filesystem — it falls back to a browser
 * download so a note is never simply lost.
 */
export class Inbox {
  /** Which area of the game the note is about. */
  area!: HTMLSelectElement;
  game!: Game;
  /** The captured frame. */
  img!: HTMLImageElement;
  /** The read-only metadata summary under the shot. */
  meta!: HTMLElement;
  node!: HTMLDivElement;
  open!: boolean;
  /** The note being written: the metadata block plus what the human types. */
  pending!: ReviewNote | null;
  reg!: Registry;
  /** Severity picker. */
  sev!: HTMLSelectElement;
  /** The one-line result readout at the bottom of the panel. */
  status!: HTMLElement;
  text!: HTMLTextAreaElement | null;
  constructor(root: HTMLElement, game: Game, reg: import('./Registry.ts').Registry) {
    this.game = game;
    this.reg = reg;
    this.open = false;
    this.pending = null;

    this.node = document.createElement('div');
    this.node.className = 'dev-inbox';
    this.node.innerHTML = `
      <div class="dev-inbox-panel">
        <h3>Review note</h3>
        <img class="dev-shot" alt="captured frame">
        <textarea rows="4" spellcheck="false" placeholder="What is wrong? One or two sentences."></textarea>
        <div class="dev-row">
          <label>severity <select class="dev-sev">${SEVERITY.map((s) => `<option>${s}</option>`).join('')}</select></label>
          <label>area <select class="dev-area">${AREA.map((s) => `<option>${s}</option>`).join('')}</select></label>
        </div>
        <div class="dev-meta"></div>
        <div class="dev-row dev-actions">
          <button class="dev-submit">Submit</button>
          <button class="dev-cancel">Cancel</button>
          <span class="dev-status"></span>
        </div>
      </div>`;
    root.appendChild(this.node);
    this.node.style.display = 'none';

    // Every one is in the `innerHTML` this constructor just wrote.
    this.img = this.node.querySelector('.dev-shot')!;
    this.text = this.node.querySelector('textarea');
    this.sev = this.node.querySelector('.dev-sev')!;
    this.area = this.node.querySelector('.dev-area')!;
    this.meta = this.node.querySelector('.dev-meta')!;
    this.status = this.node.querySelector('.dev-status')!;

    this.node.querySelector('.dev-submit')!.addEventListener('click', () => this.submit());
    this.node.querySelector('.dev-cancel')!.addEventListener('click', () => this.close());
    // Same reason as the console: the engine's Input listens on window, so a
    // note typed here would otherwise also drive the camera.
    for (const ev of ['keydown', 'keyup', 'keypress']) {
      this.node.addEventListener(ev, (e: Event) => {
        e.stopPropagation();
        if (!(e instanceof KeyboardEvent) || ev !== 'keydown') return;
        if (e.key === 'Escape') this.close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.submit();
      });
    }
  }

  /** Capture now, then open the panel. Order matters. */
  begin() {
    if (this.open) return;
    const png = capture(this.game);
    this.pending = gather(this.game, this.reg);
    this.pending.png = png;
    this.img.src = png || '';
    this.img.style.display = png ? '' : 'none';

    const p = this.pending;
    this.meta.textContent = [
      p.shot ? `shot ${p.shot}` : null,
      p.zone ? `zone ${p.zone}` : null,
      p.poi ? `poi ${p.poi}` : null,
      `cam ${p.camera.pos.join(', ')}`,
      p.time != null ? `t ${p.time.toFixed(1)}h` : null,
      p.weather,
      `${p.perf.fps} fps · ${p.perf.calls} calls`,
      Object.keys(p.cvars).length ? `⚠ ${Object.keys(p.cvars).length} cvars changed` : null,
    ].filter(Boolean).join('  ·  ');

    this.status.textContent = '';
    this.text!.value = '';
    this.open = true;
    this.node.style.display = '';
    this.text!.focus();
  }

  close() {
    this.open = false;
    this.node.style.display = 'none';
    this.pending = null;
  }

  async submit() {
    if (!this.pending) return;
    const note = this.pending;
    note.note = this.text!.value.trim();
    note.severity = this.sev.value;
    note.area = this.area.value;
    if (!note.note) { this.status.textContent = 'say something first'; return; }

    this.status.textContent = 'writing…';
    try {
      const res = await fetch('/__review/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(note),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = await res.json();
      this.status.textContent = `filed ${out.id}`;
      setTimeout(() => this.close(), 700);
    } catch (err) {
      // No dev server (static build): hand the note to the browser instead of
      // dropping it. Better a file in ~/Downloads than a lost observation.
      this._download(note);
      this.status.textContent = `no review server (${(err as Error).message}) — downloaded instead`;
    }
  }

  _download(note: ReviewNote) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' }));
    a.download = `review-note-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
