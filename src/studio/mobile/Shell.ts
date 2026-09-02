import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import { SPEEDS, type Place } from '../WorldExplorer.ts';
import { TIMES, VIEW_MODES } from '../LookLab.ts';
import { QUALITY_TIERS } from '../../engine/Renderer.ts';
import { WEATHER_NAMES } from '../../world/Weather.ts';
import { deviceRows, DOORS, doorHref } from '../DeviceReport.ts';
import type { GalleryShot } from '../ShotGallery.ts';
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

  const body = el('div.st-side.st-ui');
  root.appendChild(body);

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

  /** A footer action, as a real button. @see the header */
  function fbtn(label: string, onClick: () => void, on = false): HTMLElement {
    const b = el('button.st-fbtn.st-ui', { text: label });
    if (on) b.classList.add('on');
    b.addEventListener('click', onClick);
    return b;
  }

  function draw() {
    const id = shell.section;
    body.textContent = '';
    sheet.textContent = '';
    foot.textContent = '';
    const viewing = level === 'view';
    body.hidden = viewing;
    sheet.hidden = !viewing;
    grab.hidden = !viewing;
    root.classList.toggle('st-viewing', viewing);

    if (!id) { drawMenu(); return; }
    if (id === 'model') { drawModel(); return; }
    if (id === 'world') { drawWorld(id); return; }
    if (id === 'shots') { drawShots(); return; }
    if (id === 'look') { drawLook(); return; }
    if (id === 'device') { drawDevice(); return; }
    drawUnbuilt(id);
  }

  /* --------------------------------------------------------------- menu -- */

  function drawMenu() {
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
      drawModelSheet();
      return;
    }

    if (familyList || m.familyAt == null) {
      title.textContent = 'Model Explorer';
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
    const keys = m.keys();
    keys.forEach((k, i) => {
      const mark = m.markOf(k);
      const row = el('button.st-row.st-ui', {}, [
        el('span', { text: k }),
        el('span.st-n', { text: mark === 'ok' ? 'ok' : mark === 'flag' ? '⚑' : '' }),
      ]);
      row.addEventListener('click', () => { m.select(i); level = 'view'; draw(); });
      body.appendChild(row);
    });
    foot.appendChild(fbtn('Families', () => { familyList = true; draw(); }));
    foot.appendChild(fbtn(m.unreviewedOnly ? 'Unreviewed' : 'All', () => {
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

    const mark = m.markOf(m.current() || '');
    foot.appendChild(fbtn('‹ Prev', () => { m.step(-1); draw(); }));
    foot.appendChild(fbtn('OK', () => { m.mark(mark === 'ok' ? null : 'ok'); draw(); }, mark === 'ok'));
    foot.appendChild(fbtn('Flag', () => { m.mark(mark === 'flag' ? null : 'flag'); draw(); }, mark === 'flag'));
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
    let group = '';
    for (const p of w.places()) {
      if (p.group !== group) {
        group = p.group;
        body.appendChild(el('div.st-group', { text: group }));
      }
      const row = el('button.st-row.st-ui', {}, [
        el('span', { text: p.name }),
        el('span.st-n', { text: p.does ? '›' : '' }),
      ]);
      row.addEventListener('click', () => goTo(p));
      body.appendChild(row);
    }
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
    body.textContent = '';
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
    const ctl = el('div.st-ctl', {}, [el('span.st-pose', { text: 'm/s' })]);
    for (const v of SPEEDS) {
      const b = el('button.st-btn.st-ui', { text: `${v}` });
      b.classList.toggle('on', w.speed() === v);
      b.addEventListener('click', () => { w.setSpeed(v); draw(); });
      ctl.appendChild(b);
    }
    sheet.appendChild(ctl);
    foot.appendChild(fbtn('Places', () => { level = 'list'; draw(); }));
    foot.appendChild(fbtn('Up', () => {}, false));
    foot.appendChild(fbtn('Down', () => {}, false));
    // The two lift buttons are press-and-hold, not click, so they are wired
    // below rather than through `fbtn`'s click.
    const [, upB, downB] = [...foot.children] as HTMLElement[];
    hold(upB, (on) => { shell.cam.axes.lift = on ? 1 : 0; });
    hold(downB, (on) => { shell.cam.axes.lift = on ? -1 : 0; });
  }

  /** Press-and-hold, released on every way a finger can leave. */
  function hold(node: HTMLElement, set: (on: boolean) => void) {
    const off = () => set(false);
    node.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
    node.addEventListener('pointerup', off);
    node.addEventListener('pointercancel', off);
    node.addEventListener('pointerleave', off);
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
      if (pinchAt > 0 && now > 0) {
        const k = pinchAt / now;
        if (shell.section === 'model') shell.model.stage.zoom(k);
        // In the world a pinch is throttle, not a dolly: there is nothing to
        // dolly toward, and the speed decade is the control that matters.
        else nudgeSpeed(k < 1 ? 1 : -1);
        pinchAt = now;
      }
      return;
    }

    if (shell.section === 'model') shell.model.stage.orbit(-dx * 0.006, -dy * 0.005);
    else shell.cam.look(dx * 1.6, dy * 1.6);
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

  /** Step the speed decade, which a pinch in the world drives. */
  function nudgeSpeed(d: number) {
    const w = shell.world;
    const i = SPEEDS.indexOf(w.speed());
    const at = i < 0 ? 2 : i;
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, at + d))];
    if (next !== w.speed()) { w.setSpeed(next); draw(); }
  }

  /* -------------------------------------------------------------- travel */

  /**
   * A tap-and-hold anywhere on the world viewport flies forward.
   *
   * Not a joystick. A phone flying a review camera wants one verb — *go where I
   * am looking* — and the direction is already in the drag that got you here.
   * `Freecam.axes` sums with the keyboard's, so nothing about the desktop path
   * changes.
   */
  let holdT: ReturnType<typeof setTimeout> | null = null;
  grab.addEventListener('pointerdown', () => {
    if (shell.section === 'model') return;
    holdT = setTimeout(() => { shell.cam.axes.fwd = 1; }, 260);
  });
  const stop = () => {
    if (holdT) { clearTimeout(holdT); holdT = null; }
    shell.cam.axes.fwd = 0;
  };
  grab.addEventListener('pointerup', stop);
  grab.addEventListener('pointercancel', stop);

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
    body.appendChild(el('div.st-group', { text: `${c.standable} of ${c.total} standable here` }));
    let group = '';
    for (const row of g.shots()) {
      if (row.group !== group) {
        group = row.group;
        body.appendChild(el('div.st-group', { text: group }));
      }
      const r = el('button.st-row.st-ui', {}, [
        el('span', { text: row.name }),
        el('span.st-n', { text: row.standable ? `${row.time.toFixed(1)}h` : '\u2014' }),
      ]);
      r.classList.toggle('off', !row.standable);
      r.addEventListener('click', () => {
        if (!row.standable) { note(row.why || ''); return; }
        g.stand(row);
        level = 'view';
        draw();
      });
      body.appendChild(r);
    }
    foot.appendChild(fbtn('Back', up));
  }

  function drawShotSheet() {
    const g = shell.gallery;
    const row = g.shots().find((s) => s.name === g.at) as GalleryShot | undefined;
    sheet.appendChild(el('div.st-nums', {
      text: row ? `${row.doc || row.name}  \u00b7  ${row.time.toFixed(1)}h  \u00b7  ${row.fov}\u00b0 fov` : shell.world.where(),
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

    if (level === 'view') {
      // The same chips, in the sheet, so a knob can be turned WHILE you look at
      // what it does. That is the whole section, and it is impossible from a
      // list one level up.
      sheet.appendChild(el('div.st-nums', {
        text: `${L.timeLabel() || `${L.time().toFixed(1)}h`}  \u00b7  ${L.weather()}  \u00b7  ${L.tier()}  \u00b7  ${L.view()}`,
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
      text: L.hasWeather() ? 'Weather' : 'Weather \u2014 boots on first use',
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
    back.style.visibility = '';
    title.textContent = 'Device';
    for (const r of deviceRows(shell.game)) {
      body.appendChild(el('div.st-kv', {}, [
        el('div.st-kv-k', { text: r.k }),
        el('div.st-kv-v', { text: r.v }),
        r.note ? el('div.st-kv-n', { text: r.note }) : null,
      ]));
    }
    body.appendChild(el('div.st-group', { text: 'The way back \u2014 reloads the page' }));
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
