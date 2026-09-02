import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import type { StudioShell } from '../StudioShell.ts';

/**
 * The desktop studio shell: dense, keyboard-first, side-by-side.
 *
 * A cursor, a wheel, a middle button and a full keyboard are all available, so
 * this shell shows the list *and* the thing at once — a persistent tab bar
 * across the top and a section that owns everything under it. Nothing is one
 * screen at a time, because there is no reason for it to be.
 *
 * Keys are primary, not a shortcut layer over the mouse: `1`–`6` pick a
 * section, `Esc` steps back toward the menu and then out of the studio. Every
 * one of them is also a thing you can click, so the keyboard is an accelerator
 * rather than the only door — the same rule the mobile shell inverts.
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

  const bar = el('div.st-bar.st-ui', {}, [
    el('div.st-brand', { text: 'Game Studio' }),
    tabs,
    el('div.st-spacer'),
    el('div.st-build', { text: demoActive() ? 'phone build' : 'full build' }),
    el('div.st-tab.st-ui', { text: 'Exit' }),
  ]);
  // The Exit row is the last child of the bar and is wired here rather than
  // built with a handler, so the bar reads as one declaration.
  bar.lastChild?.addEventListener('click', () => shell.close());
  root.appendChild(bar);

  const body = el('div.st-body');
  root.appendChild(body);

  const status = el('div.st-status', {}, [
    el('div', { text: 'game paused — the world renders, nothing plays' }),
  ]);
  root.appendChild(status);

  const hint = el('div.st-hint');
  hint.innerHTML = '<b>1–6</b> section &nbsp; <b>Esc</b> back &nbsp; <b>`</b> console';
  root.appendChild(hint);

  /* --------------------------------------------------------------- menu -- */

  const menu = el('div.st-menu.st-ui', {}, [
    el('div.st-menu-h', { text: 'Game Studio' }),
  ]);
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

  /**
   * Open a section, or the studio menu when passed null.
   *
   * Sections are placeholders until their own lanes land; routing is wired
   * first on purpose, so that every later lane plugs into a shell that already
   * knows how to reach it rather than each inventing its own way in.
   */
  function show(id: SectionId | null) {
    shell.section = id;
    menu.style.display = id ? 'none' : '';
    body.textContent = '';
    for (const [k, t] of tabEls) t.classList.toggle('on', k === id);
    if (!id) return;
    const s = SECTIONS.find((x) => x.id === id);
    body.appendChild(el('div.st-menu', {}, [
      el('div.st-menu-h', { text: s ? s.title : id }),
      el('div.st-item-d', { style: 'text-align:center', text: 'Not built yet — this lane is next.' }),
    ]));
  }

  /* ---------------------------------------------------------------- keys -- */

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Escape') {
      // Step back one level at a time. Escaping straight out of the studio from
      // inside a section would make a mis-hit cost a 6.5 s reload.
      if (shell.section) show(null); else shell.close();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= avail.length) show(avail[n - 1].id);
  };
  window.addEventListener('keydown', onKey);
  shell.root.addEventListener('studio:dispose', () => window.removeEventListener('keydown', onKey));

  show(null);
}
