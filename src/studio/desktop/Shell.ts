import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import { SPEEDS } from '../WorldExplorer.ts';
import { TIMES, VIEW_MODES } from '../LookLab.ts';
import { QUALITY_TIERS } from '../../engine/Renderer.ts';
import { WEATHER_NAMES } from '../../world/Weather.ts';
import { deviceRows, DOORS, doorHref } from '../DeviceReport.ts';
import type { StudioShell } from '../StudioShell.ts';

/**
 * The desktop studio shell: dense, keyboard-first, side-by-side.
 *
 * A cursor, a wheel, a middle button and a full keyboard are all available, so
 * this shell shows the list *and* the thing at once — a persistent tab bar and
 * a left list that stays put while the viewport behind it changes. Nothing is
 * one screen at a time, because there is no reason for it to be.
 *
 * Keys are primary rather than a shortcut layer: `1`–`6` pick a section, `↑↓`
 * step the list, `[` `]` step the animation state, `o`/`f` set a verdict, `Esc`
 * steps back one level at a time. Every one of them is also clickable, so the
 * keyboard accelerates rather than gatekeeps — the rule the mobile shell has to
 * invert because it has no keyboard at all.
 */
export function install(shell: StudioShell) {
  const root = shell.root;
  const avail = shell.available();

  /* ------------------------------------------------------------- chrome -- */

  const tabs = el('div.st-tabs');
  const tabEls = new Map<SectionId, HTMLElement>();
  for (const s of avail) {
    const t = el('div.st-tab.st-ui', { text: s.short });
    t.title = s.desc;
    t.addEventListener('click', () => show(s.id));
    tabEls.set(s.id, t);
    tabs.appendChild(t);
  }

  const exit = el('div.st-tab.st-ui', { text: 'Exit' });
  exit.addEventListener('click', () => shell.close());
  root.appendChild(el('div.st-bar.st-ui', {}, [
    el('div.st-brand', { text: 'Game Studio' }),
    tabs,
    el('div.st-spacer'),
    el('div.st-build', { text: demoActive() ? 'phone build' : 'full build' }),
    exit,
  ]));

  const side = el('div.st-side.st-ui');
  root.appendChild(side);

  const info = el('div.st-info.st-ui');
  root.appendChild(info);

  // The status line reports what is actually booted, per section. v1's line —
  // "game paused, the world renders, nothing plays" — described a game being
  // suppressed, and in v2 there is no game to suppress. The count is the
  // interesting fact, and it is the same number `studiocheck` asserts.
  const statusText = el('div', { text: '' });
  root.appendChild(el('div.st-status', {}, [statusText]));
  const statusFor = (id: SectionId | null) => {
    const n = shell.game.systems.length;
    const s = `${n} system${n === 1 ? '' : 's'} booted`;
    if (id === 'model') return `Model Explorer — ${s}: no world, no characters, no simulation`;
    if (id === 'world' || id === 'shots') return `World Explorer — ${s}: world geometry only, nobody in it`;
    return `Game Studio — ${s}`;
  };

  const hint = el('div.st-hint');
  root.appendChild(hint);

  /**
   * Something to look at while five systems boot.
   *
   * `StudioShell` has reported progress through `onBusy` since v2 and no shell
   * ever drew it, so opening World or Shots froze on the last frame for whole
   * seconds — `_booting` stops the render loop by design — with nothing on
   * screen to say why. Cheap here, and the difference between "loading" and
   * "hung" everywhere.
   */
  const busyLabel = el('div.st-busy-t', { text: '' });
  const busyBar = el('i');
  const busy = el('div.st-busy', {}, [
    el('div.st-busy-in', {}, [busyLabel, el('div.st-busy-bar', {}, [busyBar])]),
  ]);
  busy.hidden = true;
  root.appendChild(busy);
  shell.onBusy = (label, t) => {
    busy.hidden = label == null;
    if (label != null) busyLabel.textContent = label;
    busyBar.style.right = `${Math.max(0, 100 - t * 100).toFixed(1)}%`;
  };

  const menu = el('div.st-menu.st-ui', {}, [el('div.st-menu-h', { text: 'Game Studio' })]);
  for (const s of avail) {
    const item = el('button.st-item', {}, [
      el('div.st-item-t', { text: s.title }),
      el('div.st-item-d', { text: s.desc }),
    ]);
    item.addEventListener('click', () => show(s.id));
    menu.appendChild(item);
  }
  root.appendChild(menu);

  /* ------------------------------------------------------------ routing -- */

  // Any change of section redraws, whoever made it -- a click, a key, or a
  // probe reaching in. @see StudioShell.setSection
  shell.onSection = (id) => draw(id);

  function show(id: SectionId | null) { void shell.setSection(id); }

  function draw(id: SectionId | null) {
    statusText.textContent = statusFor(id);
    menu.style.display = id ? 'none' : '';
    side.style.display = id ? '' : 'none';
    info.style.display = id ? '' : 'none';
    for (const [k, t] of tabEls) t.classList.toggle('on', k === id);
    render();
  }

  /** Redraw the list and the readout for whatever is open. */
  function render() {
    side.textContent = '';
    info.textContent = '';
    hint.innerHTML = '<b>1–6</b> section &nbsp; <b>Esc</b> back';

    if (shell.section === 'model') { renderModel(); return; }
    if (shell.section === 'world') { renderWorld(); return; }
    if (shell.section === 'shots') { renderShots(); return; }
    if (shell.section === 'look') { renderLook(); return; }
    if (shell.section === 'device') { renderDevice(); return; }
    if (!shell.section) return;

    const s = SECTIONS.find((x) => x.id === shell.section);
    info.appendChild(el('div.st-item-d', { text: `${s ? s.title : ''} — no screen for this yet.` }));
  }

  /* ------------------------------------------------------ shot gallery -- */

  /**
   * The 166 framings the nightly gate judges, as places to stand.
   *
   * A `follow` shot is framed on a character and the studio has none by
   * construction, so those rows are listed and dimmed with the reason rather
   * than hidden — a gallery that quietly dropped a third of the corpus would
   * misrepresent what is judged. @see ShotGallery
   */
  function renderShots() {
    const g = shell.gallery;
    const c = g.counts();
    let group = '';
    for (const row of g.shots()) {
      if (row.group !== group) {
        group = row.group;
        side.appendChild(el('div.st-group', { text: group }));
      }
      const r = el('button.st-row.st-ui', {}, [
        el('span', { text: row.name }),
        el('span.st-n', { text: row.standable ? `${row.time.toFixed(1)}h` : '—' }),
      ]);
      r.classList.toggle('on', g.at === row.name);
      r.classList.toggle('off', !row.standable);
      r.title = row.standable ? row.doc : (row.why || '');
      r.addEventListener('click', () => { if (g.stand(row)) render(); });
      side.appendChild(r);
    }
    const at = g.shots().find((x) => x.name === g.at);
    info.appendChild(el('div.st-nums', {
      text: at
        ? `${at.name}  ·  ${at.doc}  ·  ${at.time.toFixed(1)}h  ·  ${at.fov}°  ·  camera ${shell.world.where()}`
        : `${c.standable} of ${c.total} framings can be stood in with no characters booted`,
    }));
    hint.innerHTML = '<b>WASD</b> fly &nbsp; <b>drag</b> look &nbsp; <b>Esc</b> back';
  }

  /* ---------------------------------------------------------- look lab -- */

  /** Four knobs you can see the result of, and nothing you cannot. */
  function renderLook() {
    const L = shell.look;
    const chips = (label: string, names: readonly string[], on: string | null, pick: (n: string) => void) => {
      side.appendChild(el('div.st-group', { text: label }));
      const row = el('div.st-chips');
      for (const n of names) {
        const b = el('button.st-btn.st-ui', { text: n });
        b.classList.toggle('on', n === on);
        b.addEventListener('click', () => pick(n));
        row.appendChild(b);
      }
      side.appendChild(row);
    };

    chips('Time of day', TIMES.map((t) => t.label), L.timeLabel(), (label) => {
      const t = TIMES.find((x) => x.label === label);
      if (t) { L.setTime(t.h); render(); }
    });
    chips(L.hasWeather() ? 'Weather' : 'Weather — boots on first use',
      [...WEATHER_NAMES], L.hasWeather() ? L.weather() : null,
      (n) => { void L.setWeather(n as typeof WEATHER_NAMES[number]).then(render); });
    chips('Quality tier', [...QUALITY_TIERS], L.tier(), (t) => { L.setTier(t as typeof QUALITY_TIERS[number]); render(); });
    chips('Read the geometry', VIEW_MODES, L.view(), (m) => { L.setView(m); render(); });

    info.appendChild(el('div.st-nums', {
      text: `${L.timeLabel() || `${L.time().toFixed(1)}h`}  ·  ${L.weather()}  ·  ${L.tier()}  ·  ${L.view()}`,
    }));
    hint.innerHTML = '<b>WASD</b> fly &nbsp; <b>drag</b> look &nbsp; <b>Esc</b> back';
  }

  /* ------------------------------------------------------------ device -- */

  /** What this build decided at boot, read from the running module. */
  function renderDevice() {
    for (const r of deviceRows(shell.game)) {
      side.appendChild(el('div.st-kv', {}, [
        el('div.st-kv-k', { text: r.k }),
        el('div.st-kv-v', { text: r.v }),
        r.note ? el('div.st-kv-n', { text: r.note }) : null,
      ]));
    }
    side.appendChild(el('div.st-group', { text: 'The way back — reloads the page' }));
    for (const d of DOORS) {
      const row = el('button.st-row.st-ui', {}, [
        el('span', { text: d.label }),
        el('span.st-n', { text: `?${d.param}=${d.value}` }),
      ]);
      row.title = d.why;
      row.addEventListener('click', () => { location.href = doorHref(d); });
      side.appendChild(row);
    }
    info.appendChild(el('div.st-nums', {
      text: 'Every value is read from the running module, never recomputed here.',
    }));
  }

  /* ----------------------------------------------------- world explorer -- */

  function renderWorld() {
    const w = shell.world;
    const places = w.places();

    // Grouped, in the order `places()` emits: Signature first, then each type
    // band largest-first, then zones. A shell that re-sorted here would undo
    // the one thing the list is for.
    let group = '';
    for (const p of places) {
      if (p.group !== group) {
        group = p.group;
        side.appendChild(el('div.st-group', { text: group }));
      }
      const row = el('button.st-row.st-ui', {}, [el('span', { text: p.name })]);
      row.classList.toggle('on', w.at?.id === p.id);
      if (p.does) row.title = p.does;
      row.addEventListener('click', () => { w.arrive(p); render(); });
      side.appendChild(row);
    }

    const at = w.at;
    info.appendChild(el('div.st-nums', {
      text: at
        ? `${at.name}  ·  ${at.does || at.group}  ·  camera ${w.where()}${w.settled() ? '' : '  ·  streaming…'}`
        : `${places.length} destinations — pick one`,
    }));

    // The speed decade. Buttons rather than a slider: there is no wheel on a
    // phone, and the useful values span two orders of magnitude.
    const ctl = el('div.st-ctl', {}, [el('span.st-pose', { text: 'speed' })]);
    for (const v of SPEEDS) {
      const b = el('button.st-btn.st-ui', { text: `${v}` });
      b.classList.toggle('on', w.speed() === v);
      b.addEventListener('click', () => { w.setSpeed(v); render(); });
      ctl.appendChild(b);
    }
    info.appendChild(ctl);

    hint.innerHTML = '<b>WASD</b> fly &nbsp; <b>drag</b> look &nbsp; <b>wheel</b> speed &nbsp; <b>Esc</b> back';
  }

  /* ----------------------------------------------------- model explorer -- */

  function renderModel() {
    const m = shell.model;
    const fams = m.families_();

    // Families first, always visible. A drill-down that hides the family list
    // would cost a click every time you want the next family, and stepping
    // between families is the most common move in a review pass.
    side.appendChild(el('div.st-group', { text: 'Families' }));
    fams.forEach((f, i) => {
      const row = el('button.st-row.st-ui', {}, [
        el('span', { text: f.title }),
        el('span.st-n', { text: String(f.count) }),
      ]);
      row.classList.toggle('on', m.familyAt === i);
      row.addEventListener('click', () => { m.openFamily(i); render(); });
      side.appendChild(row);
    });

    if (m.familyAt == null) {
      info.appendChild(el('div.st-item-d', { text: 'Pick a family.' }));
      return;
    }

    const keys = m.keys();
    const cur = m.current();
    side.appendChild(el('div.st-group', { text: fams[m.familyAt].title }));
    keys.forEach((k, i) => {
      const mark = m.markOf(k);
      const row = el('button.st-row.st-ui', {}, [
        el('span', { text: k }),
        el('span.st-n', { text: mark === 'ok' ? 'ok' : mark === 'flag' ? '⚑' : '' }),
      ]);
      row.classList.toggle('on', k === cur);
      row.addEventListener('click', () => { m.select(i); render(); });
      side.appendChild(row);
    });

    /* ------------------------------------------------------- the readout */

    const err = m.error;
    if (err) {
      // Reported, never thrown: BRIEF rule 5 exits a capture non-zero on a page
      // error, and one broken family must not take the studio down with it.
      info.appendChild(el('div.st-err', { text: err }));
      return;
    }

    const c = m.cost();
    const pose = m.pose();
    const bits: string[] = [];
    if (cur) bits.push(cur);
    if (c) {
      bits.push(`${c.tris.toLocaleString()} tris`);
      bits.push(`${c.meshes} mesh${c.meshes === 1 ? '' : 'es'}`);
      bits.push(`${c.materials} mat${c.materials === 1 ? '' : 's'}`);
      bits.push(`${c.size.toFixed(2)} m`);
    }
    info.appendChild(el('div.st-nums', { text: bits.join('  ·  ') }));

    const controls = el('div.st-ctl');
    if (pose) {
      const prev = el('button.st-btn.st-ui', { text: '◂' });
      const next = el('button.st-btn.st-ui', { text: '▸' });
      prev.addEventListener('click', () => { m.stepPose(-1); render(); });
      next.addEventListener('click', () => { m.stepPose(1); render(); });
      controls.appendChild(prev);
      controls.appendChild(el('span.st-pose', { text: pose }));
      controls.appendChild(next);
    }
    const ok = el('button.st-btn.st-ui', { text: 'OK' });
    const flag = el('button.st-btn.st-ui', { text: 'Flag' });
    ok.addEventListener('click', () => { m.mark('ok'); render(); });
    flag.addEventListener('click', () => { m.mark('flag'); render(); });
    controls.appendChild(ok);
    controls.appendChild(flag);
    info.appendChild(controls);

    hint.innerHTML = '<b>↑↓</b> asset &nbsp; <b>[ ]</b> pose &nbsp; <b>o</b> ok &nbsp; <b>f</b> flag &nbsp; <b>Esc</b> back';
  }

  /* ---------------------------------------------------------------- keys -- */

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Escape') {
      // One level at a time. Escaping straight out of the studio from inside a
      // section would make a mis-hit cost a 6.5 s reload.
      if (shell.section === 'model' && shell.model.familyAt != null) { shell.model.familyAt = null; render(); }
      else if (shell.section) show(null);
      else shell.close();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= avail.length) { show(avail[n - 1].id); return; }

    if (shell.section !== 'model' || shell.model.familyAt == null) return;
    const m = shell.model;
    if (e.key === 'ArrowDown') { m.step(1); render(); }
    else if (e.key === 'ArrowUp') { m.step(-1); render(); }
    else if (e.key === ']') { m.stepPose(1); render(); }
    else if (e.key === '[') { m.stepPose(-1); render(); }
    else if (e.key === 'o') { m.mark('ok'); render(); }
    else if (e.key === 'f') { m.mark('flag'); render(); }
  };
  window.addEventListener('keydown', onKey);

  // `draw`, not `show`: `setSection(null)` returns early because the section is
  // already null, so `onSection` never fires and the status line, the side list
  // and the info panel keep whatever the markup gave them. @see mobile/Shell.ts
  draw(null);
}
