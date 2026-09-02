import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import { SPEEDS, type Place } from '../WorldExplorer.ts';
import { TIMES, VIEW_MODES } from '../LookLab.ts';
import { QUALITY_TIERS } from '../../engine/Renderer.ts';
import { WEATHER_NAMES } from '../../world/Weather.ts';
import { deviceRows, DOORS, doorHref } from '../DeviceReport.ts';
import type { GalleryShot } from '../ShotGallery.ts';
import { StudioList, type ListRow } from '../List.ts';
import { FlyRig } from './Fly.ts';
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
 * ## Every control is a `<button>`, and that is not a detail
 *
 * The first version built the header's ‹ and the footer's actions as `<div>`s
 * with a `click` listener, and on iOS Safari **they did nothing**: a synthetic
 * `click` is only reliably generated for elements the platform considers
 * interactive. The menu rows worked because they happened to be `<button>`s and
 * the chrome did not, which is exactly the shape of the report — *"back buttons
 * not responsive"*. Nothing on this screen is a div with a listener any more.
 *
 * ## Three levels, and the viewport is one of them
 *
 * `level` is the stack: a section's list, then the thing itself. Opening a
 * model or arriving at a place hands the whole screen to the render and puts
 * the controls in a bottom sheet, because a 393 px-tall frame cannot afford a
 * list beside a subject. Back walks *one* level, never straight out — a mis-hit
 * inside the World Explorer must not cost a world boot.
 *
 * ## The landscape gate fires on flight, not on a list
 *
 * Portrait is fully supported for every list in the studio: they read fine in
 * one hand and rotating to scroll a menu is a tax. It is *flying* that is a
 * landscape activity — the camera is 16:9 and a portrait frustum crops the
 * horizon out of the shot you came to judge — so the gate sits on that
 * threshold and nowhere else.
 */
/**
 * One row, as the list engine sees it. @see List.ts
 *
 * `make` runs once per key, `sync` on every draw. That split is what keeps the
 * scroll offset through a redraw: the element is moved, never replaced.
 */
interface Row {
  group?: string;
  make(): HTMLElement;
  sync(node: HTMLElement): void;
}

/** Rows below which a filter field is noise rather than navigation. */
const FILTER_AT = 12;

export function install(shell: StudioShell) {
  const root = shell.root;
  const avail = shell.available();

  /** Where in the drill-down we are, within the current section. */
  type Level = 'list' | 'view';
  let level: Level = 'list';
  /** Model Explorer only: null while the family list is up. */
  let familyList = true;

  /* ----------------------------------------------------- the stack chrome */

  const back = el('button.st-back.st-ui', { text: '‹', 'aria-label': 'Back' });
  const title = el('div.st-title', { text: 'Game Studio' });
  const top = el('div.st-top.st-ui', {}, [
    back,
    title,
    el('div.st-spacer'),
    el('div.st-build', { text: demoActive() ? 'phone build' : 'full build' }),
  ]);
  root.appendChild(top);

  /**
   * The filter, and the list engine under it.
   *
   * The phone's lists are the long ones — 170 destinations, 166 framings — and
   * scrolling is the only way through them on a device with no keyboard, so a
   * filter is not a convenience here. Same grammar as the desktop's and the
   * palette's, because a tool with two search syntaxes has one nobody knows.
   */
  const search = el('input.st-search.st-ui', {
    type: 'text', placeholder: 'filter…  (-term excludes)', autocomplete: 'off', spellcheck: 'false',
  }) as HTMLInputElement;
  const searchWrap = el('div.st-searchwrap.st-ui', {}, [search, el('span.st-n', { text: '' })]);
  searchWrap.hidden = true;
  root.appendChild(searchWrap);
  const searchCount = searchWrap.querySelector('.st-n') as HTMLElement;

  const body = el('div.st-side.st-ui');
  root.appendChild(body);

  const list = new StudioList<Row>(body, {
    make: (r) => r.item.make(),
    sync: (n, r) => r.item.sync(n),
    group: (r) => r.item.group || null,
  });
  search.addEventListener('input', () => {
    list.setQuery(search.value);
    searchCount.textContent = list.summary();
  });

  /**
   * A model row with its tile, where one has been captured.
   *
   * The phone gets tiles by default rather than behind a toggle: a 393 px row
   * of type is a poor way to recognise a creature and a thumbnail is a good
   * one, and there is no hover here to reveal anything else. @see Thumbs
   */
  function thumbRow(id: string, label: string, mark: string, click: () => void): Row {
    return {
      make() {
        const n = el('button.st-row.st-asset.st-ui', {}, [
          el('img.st-thumb', { alt: '' }),
          el('span', {}),
          el('span.st-n', {}),
        ]);
        n.addEventListener('click', click);
        return n;
      },
      sync(n) {
        const img = n.children[0] as HTMLImageElement;
        const src = shell.thumbs.get(id);
        if (src && img.src !== src) img.src = src;
        img.classList.toggle('none', !src);
        (n.children[1] as HTMLElement).textContent = label;
        (n.children[2] as HTMLElement).textContent = mark === 'ok' ? 'ok' : mark === 'flag' ? '⚑' : '';
      },
    };
  }

  /** Feed the engine, then report what the filter did. */
  function feed(rows: Array<ListRow<Row>>) {
    // The previous level may have appended straight into this container -- the
    // family rows do -- and the reconcile will not remove what it did not
    // create. @see StudioList.sweepForeign
    list.sweepForeign();
    // A filter over six chocobo colours is furniture. It appears when the list
    // is long enough that scrolling is the alternative -- which is the two
    // that are actually long, 170 destinations and 166 framings -- and stays
    // once a query is typed, so it cannot vanish out from under a correction.
    searchWrap.hidden = rows.length <= FILTER_AT && !list.query.trim();
    // The list starts below the filter. Without this they are both pinned to
    // the top of the content area and the first row prints under the field.
    body.classList.add('st-listed');
    list.render(rows);
    searchCount.textContent = list.summary();
  }

  /** A plain row: a name, a right-hand tag, and the whole thing is the target. */
  function plainRow(label: string, tag: string, on: boolean, off: boolean, click: () => void): Row {
    return {
      make() {
        const n = el('button.st-row.st-ui', {}, [el('span', {}), el('span.st-n', {})]);
        n.addEventListener('click', click);
        return n;
      },
      sync(n) {
        (n.children[0] as HTMLElement).textContent = label;
        (n.children[1] as HTMLElement).textContent = tag;
        n.classList.toggle('on', on);
        n.classList.toggle('off', off);
      },
    };
  }

  /**
   * The gesture catcher, over the render and under the chrome.
   *
   * Present only in `view`, so a list is never stolen from by an orbit that
   * started on a row.
   */
  const grab = el('div.st-grab');
  root.appendChild(grab);

  /** The bottom sheet: what is on screen, and what you can do to it. */
  const sheet = el('div.st-sheet.st-ui');
  root.appendChild(sheet);

  const foot = el('div.st-foot.st-ui');
  root.appendChild(foot);

  /**
   * The one thing the phone was missing most: something to look at while five
   * systems boot.
   *
   * Opening World or Shots builds terrain, water, vegetation and props — whole
   * seconds during which `StudioShell` sets `_booting` and stops drawing, so
   * the screen holds its last frame and every tap queues behind the boot. With
   * no overlay that reads exactly as a hang, and the report was that the back
   * button had stopped working. `StudioShell` has reported progress through
   * `onBusy` since v2 and neither shell had ever drawn it.
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

  /**
   * The landscape gate, on the one threshold that earns it. @see the header.
   *
   * Dismissible, and the dismissal sticks for the session: a gate a player
   * cannot get past traps anybody whose rotation lock is on, which is most
   * people most of the time and is a setting a web page cannot read.
   */
  let rotateOk = false;
  try { rotateOk = sessionStorage.getItem('ffxv:studio-rotated') === '1'; } catch { /* private mode */ }
  const isPortrait = () => window.innerHeight > window.innerWidth;

  /* ------------------------------------------------------------ routing -- */

  shell.onSection = () => { level = 'list'; familyList = true; draw(); };

  function show(id: SectionId | null) { void shell.setSection(id); }

  /** One level up, and out to the menu only from the top of a section. */
  function up() {
    if (level === 'view') { level = 'list'; draw(); return; }
    if (shell.section === 'model' && !familyList) { familyList = true; draw(); return; }
    if (shell.section) { show(null); return; }
    shell.close();
  }

  back.addEventListener('click', up);

  /**
   * Rotating the phone has to redraw, and nothing was listening.
   *
   * The landscape gate is decided inside `draw()`, and `draw()` only runs on an
   * interaction — so turning the phone sideways left "TURN YOUR PHONE SIDEWAYS"
   * sitting over a perfectly good landscape frame, with the two buttons under
   * it the only way out. Which is the report, and it is the same shape in the
   * other direction: rotating to portrait mid-flight left the sticks live over
   * a frame that should have been gated.
   *
   * `orientationchange` as well as `resize`, because iOS Safari fires the two
   * at different moments and the one that arrives first is not the one whose
   * `innerWidth` is right. The frame of delay is deliberate: on iOS the resize
   * event lands *before* the viewport metrics update, so reading them
   * synchronously answers with the old orientation.
   */
  let rotT: ReturnType<typeof setTimeout> | null = null;
  const onRotate = () => {
    if (rotT) clearTimeout(rotT);
    rotT = setTimeout(() => { rotT = null; draw(); }, 120);
  };
  window.addEventListener('resize', onRotate);
  window.addEventListener('orientationchange', onRotate);

  /** A footer action, as a real button. @see the header */
  function fbtn(label: string, onClick: () => void, on = false): HTMLElement {
    const b = el('button.st-fbtn.st-ui', { text: label });
    if (on) b.classList.add('on');
    b.addEventListener('click', onClick);
    return b;
  }

  function draw() {
    const id = shell.section;
    // NOT `body.textContent = ''`. The list engine owns `body`'s children and
    // clearing them would throw away the very nodes the reconcile exists to
    // keep — along with the scroll offset, which is the state a person is
    // actually holding. A section that draws its own controls calls `clearBody`
    // and takes the list down with it.
    searchWrap.hidden = true;
    sheet.textContent = '';
    foot.textContent = '';
    const viewing = level === 'view';
    const world = id === 'world' || id === 'shots';
    body.hidden = viewing;
    sheet.hidden = !viewing;
    // The turntable's catcher is for the Model Explorer only; the world is
    // flown with two sticks that own their own hit zones. @see mobile/Fly.ts
    grab.hidden = !viewing || world;
    flying(viewing && world && !(isPortrait() && !rotateOk));
    root.classList.toggle('st-viewing', viewing);

    if (!id) { drawMenu(); return; }
    if (id === 'model') { drawModel(); return; }
    if (id === 'world') { drawWorld(id); return; }
    if (id === 'shots') { drawShots(); return; }
    if (id === 'look') { drawLook(); return; }
    if (id === 'device') { drawDevice(); return; }
    drawUnbuilt(id);
  }

  /** Hand `body` back from the list engine, for a section that is not a list. */
  function clearBody() {
    list.render([]);
    body.classList.remove('st-listed');
    body.textContent = '';
  }

  /* --------------------------------------------------------------- menu -- */

  function drawMenu() {
    clearBody();
    title.textContent = 'Game Studio';
    back.style.visibility = 'hidden';
    for (const s of avail) {
      const item = el('button.st-item.st-ui', {}, [
        el('div.st-item-t', { text: s.title }),
        el('div.st-item-d', { text: s.desc }),
      ]);
      item.addEventListener('click', () => show(s.id));
      body.appendChild(item);
    }
    foot.appendChild(fbtn('Exit to title', () => shell.close()));
  }

  /**
   * A section with no screen yet, on a plate.
   *
   * On its own the placeholder printed "Not built yet" in grey type *across a
   * live render* — a working turntable underneath a sentence saying it did not
   * work. Whatever the text says, it has to sit on something opaque, or the
   * frame contradicts it.
   */
  function drawUnbuilt(id: SectionId) {
    clearBody();
    const s = SECTIONS.find((x) => x.id === id);
    title.textContent = s ? s.title : id;
    back.style.visibility = '';
    body.appendChild(el('div.st-blank', {}, [
      el('div.st-item-t', { text: s ? s.title : id }),
      el('div.st-item-d', { text: s ? s.desc : '' }),
      el('div.st-item-d', { text: 'No screen for this yet — the list of what is built is one tap back.' }),
    ]));
    foot.appendChild(fbtn('Back', up));
  }

  /* ------------------------------------------------------ model explorer */

  function drawModel() {
    const m = shell.model;
    const fams = m.families_();
    back.style.visibility = '';

    if (level === 'view') {
      const cur = m.current();
      title.textContent = cur || 'Model';
      // The frame about to be drawn is this asset's tile in the list you came
      // from, so the grid fills in as the pass goes. @see Thumbs
      if (cur && m.familyAt != null) shell.wantThumb(`${fams[m.familyAt].id}/${cur}`);
      drawModelSheet();
      return;
    }


    if (familyList || m.familyAt == null) {
      title.textContent = 'Model Explorer';
      clearBody();
      fams.forEach((f, i) => {
        const item = el('button.st-item.st-ui', {}, [
          el('div.st-item-t', { text: f.title }),
          el('div.st-item-d', { text: `${f.count} ${f.count === 1 ? 'asset' : 'assets'}` }),
        ]);
        item.addEventListener('click', () => { m.openFamily(i); familyList = false; draw(); });
        body.appendChild(item);
      });
      foot.appendChild(fbtn('Back', up));
      return;
    }

    title.textContent = fams[m.familyAt].title;
    const band = fams[m.familyAt].id;
    feed(m.keys().map((k, i) => {
      const mark = m.markOf(k);
      return {
        key: `asset/${band}/${k}`,
        text: `${k} ${mark}`,
        item: thumbRow(`${band}/${k}`, k, mark, () => { m.select(i); level = 'view'; draw(); }),
      };
    }));
    foot.appendChild(fbtn('Families', () => { familyList = true; draw(); }));
    foot.appendChild(fbtn(m.unreviewedOnly ? 'Unreviewed only' : 'Show all', () => {
      m.unreviewedOnly = !m.unreviewedOnly;
      m.select(0);
      draw();
    }, m.unreviewedOnly));
  }

  /** The bottom sheet over a staged model: what it costs, and what to do. */
  function drawModelSheet() {
    const m = shell.model;
    if (m.error) {
      sheet.appendChild(el('div.st-err', { text: m.error }));
      foot.appendChild(fbtn('Back', up));
      return;
    }
    const c = m.cost();
    const bits: string[] = [];
    if (c) {
      bits.push(`${c.tris.toLocaleString()} tris`);
      bits.push(`${c.meshes} mesh${c.meshes === 1 ? '' : 'es'}`);
      bits.push(`${c.materials} mat${c.materials === 1 ? '' : 's'}`);
      bits.push(`${c.size.toFixed(2)} m`);
    }
    sheet.appendChild(el('div.st-nums', { text: bits.join('  ·  ') }));

    const pose = m.pose();
    if (pose) {
      const row = el('div.st-ctl');
      const prev = el('button.st-btn.st-ui', { text: '◂', 'aria-label': 'Previous pose' });
      const next = el('button.st-btn.st-ui', { text: '▸', 'aria-label': 'Next pose' });
      prev.addEventListener('click', () => { m.stepPose(-1); draw(); });
      next.addEventListener('click', () => { m.stepPose(1); draw(); });
      row.appendChild(prev);
      row.appendChild(el('span.st-pose', { text: pose }));
      row.appendChild(next);
      sheet.appendChild(row);
    }

    /*
     * The verdict, in words, above two buttons that were labelled `OK` and
     * `Flag` and explained nowhere.
     *
     * They are the whole reason this is a review tool rather than a viewer: a
     * pass over 56 assets does not finish unless something remembers which ones
     * you have already looked at. The line says what this asset is marked as
     * and how far through the family you are, so the buttons have a subject.
     */
    const key = m.current() || '';
    const mark = m.markOf(key);
    const keys = m.keys();
    const done = keys.filter((k) => m.markOf(k) !== 'unreviewed').length;
    sheet.appendChild(el('div.st-verdict', {}, [
      el('span', {
        text: mark === 'ok' ? 'marked as looking right'
          : mark === 'flag' ? 'flagged for attention'
            : 'not reviewed yet',
      }),
      el('span.st-n', { text: `${done}/${keys.length} reviewed in this family` }),
    ]));
    foot.appendChild(fbtn('‹ Prev', () => { m.step(-1); draw(); }));
    foot.appendChild(fbtn(mark === 'ok' ? '✓ Looks right' : 'Looks right',
      () => { m.mark(mark === 'ok' ? null : 'ok'); draw(); }, mark === 'ok'));
    foot.appendChild(fbtn(mark === 'flag' ? '⚑ Flagged' : 'Flag it',
      () => { m.mark(mark === 'flag' ? null : 'flag'); draw(); }, mark === 'flag'));
    foot.appendChild(fbtn('Next ›', () => { m.step(1); draw(); }));
  }

  /* ------------------------------------------------------ world explorer */

  function drawWorld(id: SectionId) {
    const w = shell.world;
    const s = SECTIONS.find((x) => x.id === id);
    back.style.visibility = '';

    if (level === 'view') {
      if (isPortrait() && !rotateOk) { drawRotateGate(); return; }
      title.textContent = w.at ? w.at.name : 'Flying';
      drawWorldSheet();
      return;
    }

    title.textContent = s ? s.title : 'World';
    feed(w.places().map((p) => ({
      key: `place/${p.group}/${p.id}`,
      text: `${p.name} ${p.does || ''} ${p.group}`,
      item: {
        group: p.group,
        ...plainRow(p.name, p.does ? '›' : '', w.at?.id === p.id, false, () => goTo(p)),
      },
    })));
    foot.appendChild(fbtn('Back', up));
  }

  function goTo(p: Place) {
    shell.world.arrive(p);
    level = 'view';
    draw();
  }

  /**
   * "Turn your phone sideways" — but only here, and only once.
   *
   * The camera is authored 16:9 and a portrait frustum crops the horizon out of
   * the very frame you flew here to judge. The list behind it is portrait-legal
   * and stays that way.
   */
  function drawRotateGate() {
    title.textContent = 'Flying';
    body.hidden = false;
    sheet.hidden = true;
    grab.hidden = true;
    clearBody();
    body.appendChild(el('div.st-blank', {}, [
      el('div.st-item-t', { text: 'Turn your phone sideways' }),
      el('div.st-item-d', { text: 'The world is framed 16:9. Portrait crops the horizon out of the shot.' }),
    ]));
    foot.appendChild(fbtn('Fly anyway', () => {
      rotateOk = true;
      try { sessionStorage.setItem('ffxv:studio-rotated', '1'); } catch { /* private mode */ }
      draw();
    }));
    foot.appendChild(fbtn('Back', up));
  }

  /** The bottom sheet while flying: where you are, and how fast. */
  function drawWorldSheet() {
    const w = shell.world;
    const at = w.at;
    sheet.appendChild(el('div.st-nums', {
      text: at
        ? `${at.does || at.group}  ·  ${w.where()}${w.settled() ? '' : '  ·  streaming…'}`
        : w.where(),
    }));
    // Speed reads as one number with a step either side, not five buttons
    // competing for a glance: at 400 m/s the useful question is "slower", and
    // the decade is what answers it. @see WorldExplorer.SPEEDS
    const i = Math.max(0, SPEEDS.indexOf(w.speed()));
    const step = (d: number) => {
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + d))];
      if (next !== w.speed()) { w.setSpeed(next); draw(); }
    };
    const slower = el('button.st-btn.st-ui', { text: '−', 'aria-label': 'Slower' });
    const faster = el('button.st-btn.st-ui', { text: '+', 'aria-label': 'Faster' });
    slower.addEventListener('click', () => step(-1));
    faster.addEventListener('click', () => step(1));
    sheet.appendChild(el('div.st-ctl', {}, [
      slower,
      el('span.st-pose', { text: `${w.speed()} m/s` }),
      faster,
      // The one line that says what the two thumbs do. It is here rather than
      // in a help screen because nobody opens a help screen, and the controls
      // it names were reported as unreadable without it.
      el('span.st-hintline', { text: 'left thumb moves · right half looks · rim boosts' }),
    ]));
    foot.appendChild(fbtn('Places', () => { level = 'list'; draw(); }));
    foot.appendChild(fbtn('Look Lab', () => show('look')));
  }

  /* ---------------------------------------------------------- gestures -- */

  /**
   * One finger looks or orbits; two pinch.
   *
   * The same catcher serves both explorers because the verb is the same
   * gesture on either — drag turns the subject on the turntable and turns the
   * camera in the world — and one implementation cannot disagree with itself
   * about which finger is which.
   *
   * A drag in the world is *travel* as well as look: with no keyboard there is
   * no WASD, so holding after a drag flies forward. `Freecam.axes` is the seam.
   */
  const pointers = new Map<number, { x: number, y: number }>();
  let pinchAt = 0;

  grab.addEventListener('pointerdown', (e) => {
    grab.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinchAt = spread();
  });

  grab.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const now = spread();
      if (pinchAt > 0 && now > 0 && shell.section === 'model') {
        // Models only. A pinch used to step the world's speed decade -- two
        // orders of magnitude, changed by the one gesture whose hand covers the
        // readout saying what it now is. Speed is a labelled control in the
        // sheet and nothing else touches it.
        shell.model.stage.zoom(pinchAt / now);
        pinchAt = now;
      }
      return;
    }

    // Models only. The world's look lives on the right stick now, which is a
    // rate rather than a delta and can be held. @see mobile/Fly.ts
    if (shell.section === 'model') shell.model.stage.orbit(-dx * 0.006, -dy * 0.005);
  });

  const lift = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchAt = 0;
  };
  grab.addEventListener('pointerup', lift);
  grab.addEventListener('pointercancel', lift);

  function spread(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /* -------------------------------------------------------------- travel */

  /**
   * Flying is two thumbs, and it is the game's own control layer.
   *
   * There was a hold-anywhere-to-fly gesture here, on the same finger as look,
   * with a 260 ms timer. @see mobile/Fly.ts for what that cost and what it is
   * now. Built on first flight and kept, because it owns a `requestAnimationFrame`
   * and rebuilding it per redraw would leak one per draw.
   */
  let fly: FlyRig | null = null;
  function flying(on: boolean) {
    if (on && !fly) fly = new FlyRig(root, shell.cam);
    if (fly) {
      fly.root.hidden = !on;
      if (!on) fly.release();
    }
  }

  /* ------------------------------------------------------------ redraws -- */

  /**
   * The world's numbers change without anybody touching anything — the camera
   * moves, the streamer settles — so the sheet is repainted on a slow timer
   * while it is showing. 2 Hz: fast enough that "streaming…" clears while you
   * are still looking at it, slow enough to cost nothing.
   */
  const tick = setInterval(() => {
    if (level !== 'view') return;
    if (shell.section !== 'world' && shell.section !== 'shots') return;
    if (isPortrait() && !rotateOk) return;
    drawWorldNumbers();
  }, 500);
  void tick;

  function drawWorldNumbers() {
    const n = sheet.querySelector('.st-nums');
    if (!n) return;
    const w = shell.world;
    const at = w.at;
    n.textContent = at
      ? `${at.does || at.group}  ·  ${w.where()}${w.settled() ? '' : '  ·  streaming…'}`
      : w.where();
  }

  /* -------------------------------------------------------- shot gallery */

  /**
   * The 166 framings, as places to stand.
   *
   * Rows that cannot be stood in are shown and said so rather than hidden: a
   * gallery that silently dropped a third of the corpus would be lying about
   * what the nightly gate judges. @see ShotGallery
   */
  function drawShots() {
    const g = shell.gallery;
    back.style.visibility = '';

    if (level === 'view') {
      title.textContent = g.at || 'Shot';
      drawShotSheet();
      return;
    }

    const c = g.counts();
    title.textContent = 'Shot Gallery';
    feed(g.shots().map((row) => ({
      key: `shot/${row.name}`,
      text: `${row.name} ${row.doc} ${row.group}`,
      item: {
        group: row.group,
        ...plainRow(row.name, row.standable ? `${row.time.toFixed(1)}h` : '—',
          g.at === row.name, !row.standable, () => {
            if (!row.standable) { note(row.why || ''); return; }
            g.stand(row);
            level = 'view';
            draw();
          }),
      },
    })));
    searchCount.textContent = `${c.standable} of ${c.total} standable`;
    foot.appendChild(fbtn('Back', up));
  }

  function drawShotSheet() {
    const g = shell.gallery;
    const row = g.shots().find((s) => s.name === g.at) as GalleryShot | undefined;
    sheet.appendChild(el('div.st-nums', {
      text: row ? `${row.doc || row.name}  ·  ${row.time.toFixed(1)}h  ·  ${row.fov}° fov` : shell.world.where(),
    }));
    sheet.appendChild(el('div.st-nums', { text: shell.world.where() }));
    foot.appendChild(fbtn('Shots', () => { level = 'list'; draw(); }));
    foot.appendChild(fbtn('Look', () => show('look')));
  }

  /* ------------------------------------------------------------ look lab */

  /** Four knobs, each of which you can see the result of. @see LookLab */
  function drawLook() {
    const L = shell.look;
    back.style.visibility = '';
    title.textContent = 'Look Lab';
    clearBody();

    if (level === 'view') {
      // The same chips, in the sheet, so a knob can be turned WHILE you look at
      // what it does. That is the whole section, and it is impossible from a
      // list one level up.
      sheet.appendChild(el('div.st-nums', {
        text: `${L.timeLabel() || `${L.time().toFixed(1)}h`}  ·  ${L.weather()}  ·  ${L.tier()}  ·  ${L.view()}`,
      }));
      sheet.appendChild(chips(TIMES.map((t) => t.label), L.timeLabel(), (label) => {
        const t = TIMES.find((x) => x.label === label);
        if (t) { L.setTime(t.h); draw(); }
      }));
      sheet.appendChild(chips(VIEW_MODES, L.view(), (m) => { L.setView(m); draw(); }));
      foot.appendChild(fbtn('Controls', () => { level = 'list'; draw(); }));
      foot.appendChild(fbtn('Back', up));
      return;
    }

    body.appendChild(el('div.st-group', { text: 'Time of day' }));
    body.appendChild(chips(TIMES.map((t) => t.label), L.timeLabel(), (label) => {
      const t = TIMES.find((x) => x.label === label);
      if (t) { L.setTime(t.h); draw(); }
    }));

    body.appendChild(el('div.st-group', {
      text: L.hasWeather() ? 'Weather' : 'Weather — boots on first use',
    }));
    body.appendChild(chips([...WEATHER_NAMES], L.hasWeather() ? L.weather() : null, (name) => {
      void L.setWeather(name as typeof WEATHER_NAMES[number]).then(draw);
    }));

    body.appendChild(el('div.st-group', { text: 'Quality tier' }));
    body.appendChild(chips([...QUALITY_TIERS], L.tier(), (t) => {
      L.setTier(t as typeof QUALITY_TIERS[number]);
      draw();
    }));

    body.appendChild(el('div.st-group', { text: 'Read the geometry' }));
    body.appendChild(chips(VIEW_MODES, L.view(), (m) => { L.setView(m); draw(); }));

    foot.appendChild(fbtn('Look at it', () => { level = 'view'; draw(); }));
    foot.appendChild(fbtn('Back', up));
  }

  /** A row of exclusive chips. The shape every Look Lab control takes. */
  function chips(names: readonly string[], on: string | null, pick: (n: string) => void): HTMLElement {
    const row = el('div.st-chips');
    for (const n of names) {
      const b = el('button.st-btn.st-ui', { text: n });
      b.classList.toggle('on', n === on);
      b.addEventListener('click', () => pick(n));
      row.appendChild(b);
    }
    return row;
  }

  /* -------------------------------------------------------------- device */

  /** What this build decided at boot, and the documented ways back. */
  function drawDevice() {
    clearBody();
    back.style.visibility = '';
    title.textContent = 'Device';
    for (const r of deviceRows(shell.game)) {
      body.appendChild(el('div.st-kv', {}, [
        el('div.st-kv-k', { text: r.k }),
        el('div.st-kv-v', { text: r.v }),
        r.note ? el('div.st-kv-n', { text: r.note }) : null,
      ]));
    }
    body.appendChild(el('div.st-group', { text: 'The way back — reloads the page' }));
    for (const d of DOORS) {
      const row = el('button.st-row.st-ui', {}, [
        el('span', { text: d.label }),
        el('span.st-n', { text: `?${d.param}=${d.value}` }),
      ]);
      row.title = d.why;
      row.addEventListener('click', () => { location.href = doorHref(d); });
      body.appendChild(row);
    }
    foot.appendChild(fbtn('Back', up));
  }

  /** Say something transient in the title, for a tap that cannot do anything. */
  let noteT: ReturnType<typeof setTimeout> | null = null;
  function note(text: string) {
    if (!text) return;
    const was = title.textContent;
    title.textContent = text;
    if (noteT) clearTimeout(noteT);
    noteT = setTimeout(() => { title.textContent = was; }, 2600);
  }

  // `draw`, NOT `show(null)`. `setSection(null)` returns early when the section
  // is already null -- which it is, straight out of the constructor -- so
  // `onSection` never fires and the first paint never happens. The desktop
  // shell hides the same bug because it builds its list in `install()`; here
  // every row is built in `draw()`, so the studio came up as a header over a
  // black screen on a phone. The first paint is this file's job, not the
  // shell's.
  draw();
}
