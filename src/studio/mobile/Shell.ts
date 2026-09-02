import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import type { StudioShell } from '../StudioShell.ts';

/**
 * The mobile studio shell: one thing at a time, thumb-reachable.
 *
 * Not the desktop shell scaled down. `hover: none` means no keyboard, no
 * right-click, no middle button, no wheel, no cursor to hover for a tooltip —
 * a thumb instead of a pointer, and a hand covering the bottom third of the
 * screen. So:
 *
 *  - **A drill-down stack, not panels.** A 390 px viewport cannot hold a list
 *    and its subject at once, so it holds one and a back affordance.
 *  - **Controls at the bottom**, inside the thumb arc, never the top corners.
 *  - **Every target ≥ 44 px, and the row *is* the target** — not a chevron
 *    inside it.
 *  - **Nothing is discovered by hovering**, because nothing can be.
 *  - **No console.** Everything it can do is reachable as a control.
 *
 * ## The landscape gate is not here
 *
 * Portrait is fully supported for the studio menu and every section that is a
 * list. `RotateGate` belongs at exactly two thresholds — committing to New Game
 * or Continue, and entering world *flight* after a destination is picked — both
 * of which are genuinely landscape activities. Opening the World Explorer's
 * list is a menu and reads fine in one hand, so the gate is a threshold on the
 * activity rather than a tax on the section.
 */
export function install(shell: StudioShell) {
  const root = shell.root;
  const avail = shell.available();

  /* ----------------------------------------------------- the stack chrome */

  const back = el('div.st-back.st-ui', { text: '‹' });
  const title = el('div.st-title', { text: 'Game Studio' });
  const top = el('div.st-top.st-ui', {}, [
    back,
    title,
    el('div.st-spacer'),
    el('div.st-build', { text: demoActive() ? 'phone build' : 'full build' }),
  ]);
  root.appendChild(top);

  const body = el('div.st-side.st-ui');
  root.appendChild(body);

  const foot = el('div.st-foot.st-ui');
  root.appendChild(foot);

  /* ------------------------------------------------------------ routing -- */

  /**
   * One level of the drill-down stack.
   *
   * `null` is the studio menu; anything else is a section. The back button and
   * Android's own back gesture both land here, so there is exactly one way up
   * and it cannot get out of step with the header.
   */
  shell.onSection = (id) => draw(id);

  function show(id: SectionId | null) { shell.setSection(id); }

  function draw(id: SectionId | null) {
    body.textContent = '';
    foot.textContent = '';

    if (!id) {
      title.textContent = 'Game Studio';
      back.style.visibility = 'hidden';
      const menu = el('div');
      for (const s of avail) {
        const item = el('button.st-item.st-ui', {}, [
          el('div.st-item-t', { text: s.title }),
          el('div.st-item-d', { text: s.desc }),
        ]);
        item.addEventListener('click', () => show(s.id));
        menu.appendChild(item);
      }
      body.appendChild(menu);
      const exit = el('div.st-fbtn.st-ui', { text: 'Exit to title' });
      exit.addEventListener('click', () => shell.close());
      foot.appendChild(exit);
      return;
    }

    const s = SECTIONS.find((x) => x.id === id);
    title.textContent = s ? s.title : id;
    back.style.visibility = '';
    body.appendChild(el('div.st-item-d', {
      style: 'text-align:center;padding:40px 20px',
      text: 'Not built yet — this lane is next.',
    }));
    const b = el('div.st-fbtn.st-ui', { text: 'Back' });
    b.addEventListener('click', () => show(null));
    foot.appendChild(b);
  }

  back.addEventListener('click', () => {
    if (shell.section) show(null); else shell.close();
  });

  show(null);
}
