import { demoActive } from '../../engine/Device.ts';
import { el } from '../../ui/UIKit.ts';
import { SECTIONS, type SectionId } from '../Sections.ts';
import { SPEEDS } from '../WorldExplorer.ts';
import { TIMES, VIEW_MODES } from '../LookLab.ts';
import { QUALITY_TIERS } from '../../engine/Renderer.ts';
import { WEATHER_NAMES } from '../../world/Weather.ts';
import { deviceRows, DOORS, doorHref } from '../DeviceReport.ts';
import { StudioList, type ListRow } from '../List.ts';
import { Palette, type Command } from '../Palette.ts';
import type { StudioShell } from '../StudioShell.ts';

/**
 * One row, as the list engine sees it: how to build it, and how to update it.
 *
 * `make` runs once per key and `sync` runs on every draw, which is the whole
 * reason the scroll survives a redraw — the element is not replaced, only its
 * mutable parts are rewritten. @see List.ts
 */
interface Row {
  group?: string;
  make(): HTMLElement;
  sync(node: HTMLElement): void;
}

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

  /**
   * The filter, and the list engine under it.
   *
   * `side` used to be cleared and rebuilt on every interaction — which lost the
   * scroll offset every time a verdict was recorded, so a review pass over a
   * 23-row family meant re-scrolling after each one. `StudioList` reconciles by
   * key instead, so stepping an asset moves a highlight and nothing else.
   * @see List.ts
   */
  const search = el('input.st-search.st-ui', {
    type: 'text', placeholder: 'filter…  (-term excludes)', autocomplete: 'off', spellcheck: 'false',
  }) as HTMLInputElement;
  const searchWrap = el('div.st-searchwrap.st-ui', {}, [search, el('span.st-n', { text: '' })]);
  root.appendChild(searchWrap);
  const searchCount = searchWrap.querySelector('.st-n') as HTMLElement;

  /**
   * List or tiles.
   *
   * A roster is read two ways — by name when you know what you want, by
   * silhouette when you are looking for the one that is wrong — and the second
   * is what a review pass actually does. The toggle is per-session and lives
   * next to the filter because they are the same kind of control.
   */
  let tiles = false;
  const tileBtn = el('button.st-btn.st-ui', { text: 'tiles', title: 'List or tiles' });
  tileBtn.addEventListener('click', () => {
    tiles = !tiles;
    tileBtn.classList.toggle('on', tiles);
    side.classList.toggle('st-tiles', tiles);
    render();
  });
  searchWrap.appendChild(tileBtn);

  const side = el('div.st-side.st-ui');
  root.appendChild(side);

  /** One engine, re-pointed per section, so scroll and identity survive. */
  const list = new StudioList<Row>(side, {
    make: (r) => r.item.make(),
    sync: (n, r) => r.item.sync(n),
    group: (r) => r.item.group || null,
  });
  search.addEventListener('input', () => {
    list.setQuery(search.value);
    searchCount.textContent = list.summary();
  });

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
    // What is TRUE, not what was true the first time. Systems are never torn
    // down, so once the World Explorer has been opened the Model Explorer's
    // count is eight and the old copy — "no world" — was a lie the status line
    // told with a straight face. The world is hidden, not absent, and saying so
    // is the difference between a truthful readout and a decorative one.
    if (id === 'model') {
      return `Model Explorer — ${s}: ${shell.worldBooted ? 'the world is built and hidden' : 'no world'}`
        + ', no characters, no simulation';
    }
    if (id === 'world' || id === 'shots' || id === 'look') return `World Explorer — ${s}: world geometry only, nobody in it`;
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

  /**
   * Redraw the list and the readout for whatever is open.
   *
   * `info` and `hint` are rebuilt because they are three elements; `side` is
   * not, because it is up to 170 and the scroll offset inside it is state a
   * person is holding. `list.render` reconciles by key. @see List.ts
   */
  function render() {
    info.textContent = '';
    hint.innerHTML = '<b>1-6</b> section &nbsp; <b>&#8984;K</b> go to &nbsp; <b>Esc</b> back';
    // The filter belongs to the lists, not to the knob panels.
    // The filter belongs to the lists, not to the knob panels or the menu, and
    // `side` has to start below it when it is there. `feed()` sets `st-listed`.
    const listed = shell.section === 'model' || shell.section === 'world' || shell.section === 'shots';
    searchWrap.hidden = !(listed && shell.section);
    side.classList.toggle('st-listed', !!(listed && shell.section));

    if (shell.section === 'model') { renderModel(); return; }
    if (shell.section === 'world') { renderWorld(); return; }
    if (shell.section === 'shots') { renderShots(); return; }
    if (shell.section === 'look') { renderLook(); return; }
    if (shell.section === 'device') { renderDevice(); return; }
    list.render([]);
    if (!shell.section) return;

    const s = SECTIONS.find((x) => x.id === shell.section);
    info.appendChild(el('div.st-item-d', { text: `${s ? s.title : ''} - no screen for this yet.` }));
  }

  /** Feed the engine, then report what the filter did. */
  function feed(rows: Array<ListRow<Row>>) {
    list.render(rows);
    searchCount.textContent = list.summary();
  }

  /**
   * The row every list uses: a plate with a name and a right-hand tag.
   *
   * One builder rather than four, because the four lists differ only in what
   * goes in the tag — and `sync` has to touch exactly the mutable parts or the
   * reconcile is doing nothing for us.
   */
  function plainRow(
    label: string, tag: string, on: boolean, off: boolean, title: string, click: () => void,
  ): Row {
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
        n.title = title;
      },
    };
  }

  /**
   * A model row, which in tile mode is a picture.
   *
   * The same element either way — the class decides the layout and the `<img>`
   * is simply empty until a frame has been captured for that key. Two element
   * shapes would mean the reconcile could not keep a node across the toggle,
   * which is the one thing it is for. @see Thumbs
   */
  function assetRow(id: string, label: string, mark: string, on: boolean, click: () => void): Row {
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
        // Only when it changes: writing an identical `src` re-decodes the data
        // URL, and this runs for every visible row on every redraw.
        if (src && img.src !== src) img.src = src;
        img.classList.toggle('none', !src);
        (n.children[1] as HTMLElement).textContent = label;
        (n.children[2] as HTMLElement).textContent = mark === 'ok' ? 'ok' : mark === 'flag' ? '⚑' : '';
        n.classList.toggle('on', on);
      },
    };
  }

  /* ------------------------------------------------------ shot gallery -- */

  /**
   * The 166 framings the nightly gate judges, as places to stand.
   *
   * A `follow` shot is framed on a character and the studio has none by
   * construction, so those rows are listed and dimmed with the reason rather
   * than hidden - a gallery that quietly dropped a third of the corpus would
   * misrepresent what is judged. @see ShotGallery
   */
  function renderShots() {
    const g = shell.gallery;
    const c = g.counts();
    feed(g.shots().map((row) => ({
      key: `shot/${row.name}`,
      text: `${row.name} ${row.doc} ${row.group}`,
      item: {
        group: row.group,
        ...plainRow(
          row.name,
          row.standable ? `${row.time.toFixed(1)}h` : '-',
          g.at === row.name,
          !row.standable,
          row.standable ? row.doc : (row.why || ''),
          () => { if (g.stand(row)) render(); },
        ),
      },
    })));
    const at = g.shots().find((x) => x.name === g.at);
    info.appendChild(el('div.st-nums', {
      text: at
        ? `${at.name}  ·  ${at.doc}  ·  ${at.time.toFixed(1)}h  ·  ${at.fov}°  ·  camera ${shell.world.where()}`
        : `${c.standable} of ${c.total} framings can be stood in with no characters booted`,
    }));
    hint.innerHTML = '<b>WASD</b> fly &nbsp; <b>drag</b> look &nbsp; <b>&#8984;K</b> go to &nbsp; <b>Esc</b> back';
  }

  /* ---------------------------------------------------------- look lab -- */

  /** Four knobs you can see the result of, and nothing you cannot. */
  function renderLook() {
    const L = shell.look;
    list.render([]);
    side.textContent = '';
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
    chips(L.hasWeather() ? 'Weather' : 'Weather - boots on first use',
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
    list.render([]);
    side.textContent = '';
    for (const r of deviceRows(shell.game)) {
      side.appendChild(el('div.st-kv', {}, [
        el('div.st-kv-k', { text: r.k }),
        el('div.st-kv-v', { text: r.v }),
        r.note ? el('div.st-kv-n', { text: r.note }) : null,
      ]));
    }
    side.appendChild(el('div.st-group', { text: 'The way back - reloads the page' }));
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
    feed(places.map((p) => ({
      key: `place/${p.group}/${p.id}`,
      text: `${p.name} ${p.does || ''} ${p.group}`,
      item: {
        group: p.group,
        ...plainRow(p.name, '', w.at?.id === p.id, false, p.does || '', () => { w.arrive(p); render(); }),
      },
    })));

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

    hint.innerHTML = '<b>WASD</b> fly &nbsp; <b>drag</b> look &nbsp; <b>wheel</b> speed &nbsp; <b>&#8984;K</b> go to &nbsp; <b>Esc</b> back';
  }

  /* ----------------------------------------------------- model explorer -- */

  function renderModel() {
    const m = shell.model;
    const fams = m.families_();
    const rows: Array<ListRow<Row>> = [];

    // Families first, always visible. A drill-down that hides the family list
    // would cost a click every time you want the next family, and stepping
    // between families is the most common move in a review pass.
    fams.forEach((f, i) => {
      rows.push({
        key: `fam/${f.id}`,
        text: `${f.title} family`,
        item: {
          group: 'Families',
          ...plainRow(f.title, String(f.count), m.familyAt === i, false, '',
            () => { m.openFamily(i); render(); }),
        },
      });
    });

    if (m.familyAt != null) {
      const keys = m.keys();
      const cur = m.current();
      const band = fams[m.familyAt].title;
      keys.forEach((k, i) => {
        const mark = m.markOf(k);
        const id = `${fams[m.familyAt!].id}/${k}`;
        rows.push({
          key: `asset/${id}`,
          text: `${k} ${band} ${mark}`,
          item: {
            group: band,
            ...assetRow(id, k, mark, k === cur, () => { m.select(i); render(); }),
          },
        });
      });
    }
    feed(rows);

    if (m.familyAt == null) {
      info.appendChild(el('div.st-item-d', { text: 'Pick a family.' }));
      return;
    }
    const cur = m.current();
    if (cur) {
      list.reveal(`asset/${fams[m.familyAt].id}/${cur}`);
      // The frame about to be drawn is this asset's tile. @see Thumbs
      shell.wantThumb(`${fams[m.familyAt].id}/${cur}`);
    }

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

    hint.innerHTML = '<b>↑↓</b> asset &nbsp; <b>[ ]</b> pose &nbsp; <b>o</b> ok &nbsp; <b>f</b> flag &nbsp; <b>&#8984;K</b> go to &nbsp; <b>Esc</b> back';
  }

  /* ------------------------------------------------------------ palette -- */

  /**
   * Everything the studio can reach, as one flat list for `⌘K`.
   *
   * Built on demand rather than kept: the model roster is read live from the
   * registries, the destination list changes with the build, and a cached copy
   * would be the fourth place in this project where a count went stale.
   * @see Palette.ts
   */
  const palette = new Palette(root, (): Command[] => {
    const out: Command[] = [];
    for (const s of avail) {
      out.push({ id: s.id, label: s.title, group: 'Section', hint: s.desc, run: () => show(s.id) });
    }
    const m = shell.model;
    m.families_().forEach((f, fi) => {
      for (const k of shell.model.families[fi].keys()) {
        out.push({
          id: `${f.id}/${k}`,
          label: k,
          group: `Models · ${f.title}`,
          run: () => {
            void shell.setSection('model').then(() => {
              m.openFamily(fi);
              m.select(Math.max(0, m.keys().indexOf(k)));
              render();
            });
          },
        });
      }
    });
    for (const p of shell.world.places()) {
      out.push({
        id: p.id,
        label: p.name,
        group: `World · ${p.group}`,
        hint: p.does,
        run: () => { void shell.setSection('world').then(() => { shell.world.arrive(p); render(); }); },
      });
    }
    for (const row of shell.gallery.shots()) {
      if (!row.standable) continue;
      out.push({
        id: row.name,
        label: row.name,
        group: `Shots · ${row.group}`,
        hint: row.doc,
        run: () => { void shell.setSection('shots').then(() => { shell.gallery.stand(row); render(); }); },
      });
    }
    return out;
  });
  void palette;


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
