import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import { SPEEDS } from '../WorldExplorer.ts';
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

  const statusText = el('div', { text: 'game paused — the world renders, nothing plays' });
  root.appendChild(el('div.st-status', {}, [statusText]));

  const hint = el('div.st-hint');
  root.appendChild(hint);

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

  function show(id: SectionId | null) { shell.setSection(id); }

  function draw(id: SectionId | null) {
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
    if (!shell.section) return;

    const s = SECTIONS.find((x) => x.id === shell.section);
    info.appendChild(el('div.st-item-d', { text: `${s ? s.title : ''} — not built yet, this lane is next.` }));
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
    const fams = m.families();

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

    const err = m.error();
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

  show(null);
}
