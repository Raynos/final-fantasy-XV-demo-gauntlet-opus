import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { PartBuilder } from '../props/PartBuilder.ts';
import { woodMaterial } from '../props/PropMaterials.ts';
import {
  asphaltMaterial, slabMaterial, gravelMaterial, corrugatedMaterial, panelMaterial,
  galvMaterial, scrapMaterial, rubberMaterial, glassMaterial, darkGlassMaterial, lampMaterial,
  chainlinkMaterial, signMaterial, hammerheadSignTexture, crowsNestSignTexture,
  garageSignTexture, huntBoardTexture, menuBoardTexture, rentABirdTexture, cullessTexture,
} from './TownMaterials.ts';
import {
  mat4, box, cyl, plane, torus, wheel, fenceRun, floodMast, tyreStack, drum,
  carShell, patioSet, palletStack,
} from './TownKit.ts';
import { ShopScreen } from '../../ui/screens/ShopScreen.ts';
import { HuntBoardScreen } from '../../ui/screens/HuntBoardScreen.ts';
import { TOWN_SHOPS } from './Shops.ts';

/**
 * HAMMERHEAD — Leide's one working truck stop, and the hub the whole quest
 * loop closes at.
 *
 * The world already lays a Coernix-style fuel stop beside Route 1 in
 * `Ecology._layoutSites` (`beside('reststop', 25, 1, 34, 26)`). This system
 * **promotes that site** rather than inventing a new one: it takes the same
 * anchor, removes the placeholder forecourt `Outposts` built there, and puts
 * the real place on top — Cid's garage with its roller doors, the Crow's Nest
 * diner, the fuel canopy and pumps, the pylon sign, the caravan, the parts
 * yard, the chain-link and the floodlights that come on after dark.
 *
 * Everything is authored in a local frame:
 *
 * ```
 *                     +v  (away from the highway, the parts yard end)
 *                      |
 *   -u  <----  site  ----> +u   (along the highway)
 *                      |
 *                     -v  (the forecourt, then the road at v = -34)
 * ```
 *
 * The whole town merges to one mesh per material — nine of them — and the
 * detail props switch off past 130 m, so from the vista shots it costs a
 * silhouette and nothing else.
 */

/** Where the layout stops; kept inside the ecology's cleared radius. */
const PAD = { u0: -28, u1: 29, v0: -31, v1: 17 };

export class Hammerhead {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'hammerhead';
    this.lights = [];
    /** Named world-space anchors other systems ask for. */
    this.anchors = {};
    this._camPos = new THREE.Vector3();
    this._handles = [];
  }

  async init(game: any) {
    this.game = game;
    const props = game.get('Props');
    const veg = game.get('Vegetation');
    const eco = (props && props.ecology) || (veg && veg.ecology);
    if (!eco) { console.warn('[Hammerhead] no Ecology; town not built'); return this; }
    this.eco = eco;

    const site = eco.sites.find((s) => s.type === 'reststop');
    if (!site) { console.warn('[Hammerhead] no reststop site'); return this; }
    this.site = site;
    // Widen the clearing so scrub stops at the edge of the tarmac. Ecology is
    // owned by another workstream, so this patches the site record rather than
    // the source; grass tiles built after this point respect it.
    site.r = Math.max(site.r, 44);

    // Drop the placeholder fuel stop this system replaces.
    this._removePlaceholder(props);

    // Local frame: +u along the road, +v away from it.
    const t = eco.roadTangent(site.roadZ ?? 25, new THREE.Vector2());
    const nx = t.y, nz = -t.x;                    // road normal, +1 side
    this.yaw = Math.atan2(nx, nz);
    this.base = this._padHeight(site.x, site.z);
    this.world = mat4([site.x, this.base, site.z], [0, this.yaw, 0]);
    this.origin = new THREE.Vector3(site.x, this.base, site.z);

    this._build();
    game.scene.add(this.root);

    this._registerScreens(game);
    this._registerInteractables(game);
    if (game.debug) {
      console.log('[Hammerhead]', JSON.stringify({
        origin: [+this.origin.x.toFixed(1), +this.base.toFixed(1), +this.origin.z.toFixed(1)],
        yaw: +this.yaw.toFixed(3),
        ...this.stats,
      }));
    }
    return this;
  }

  /* ------------------------------------------------------------- helpers */

  /**
   * A truck stop is graded flat before anything is poured — cut on the high
   * side, filled on the low side.
   *
   * Taking the *maximum* ground height turns the pad into a plateau floating
   * over the basin; taking the minimum buries it. The 70th percentile puts the
   * platform just proud of most of the site, which leaves a shallow cut behind
   * the garage and a metre of fill toward the road, and the graded berm built
   * in `_berm` carries that fill down to the terrain the way a real earthworks
   * would.
   */
  _padHeight(x, z) {
    const hs = [];
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const u = PAD.u0 + (PAD.u1 - PAD.u0) * (i / 10);
        const v = PAD.v0 + (PAD.v1 - PAD.v0) * (j / 10);
        const p = this._toWorldFlat(x, z, u, v);
        hs.push(this.eco.height(p[0], p[1]));
      }
    }
    hs.sort((a, b) => a - b);
    // Near the maximum, not the median: anything lower and the basin's own
    // relief punches humps of scrub straight up through the forecourt. The
    // outlier trim keeps one boulder from lifting the whole town a metre.
    return hs[Math.floor((hs.length - 1) * 0.985)] + 0.12;
  }

  /**
   * The graded embankment that carries the pad down to the basin floor.
   *
   * Built as a real strip of geometry sampled against the terrain rather than a
   * box: the edge of the tarmac has to meet the ground at whatever height the
   * ground happens to be, or the whole town reads as a slab dropped on top of
   * the landscape — which is precisely how it read before this existed.
   */
  _berm(put, M) {
    const W = 13.0;                                 // how far the fill runs out
    const step = 3.0;
    const pos = [];
    const uvs = [];
    const idx = [];
    const edges = [
      { a: [PAD.u0, PAD.v0], b: [PAD.u1, PAD.v0], n: [0, -1] },
      { a: [PAD.u1, PAD.v0], b: [PAD.u1, PAD.v1], n: [1, 0] },
      { a: [PAD.u1, PAD.v1], b: [PAD.u0, PAD.v1], n: [0, 1] },
      { a: [PAD.u0, PAD.v1], b: [PAD.u0, PAD.v0], n: [-1, 0] },
    ];
    for (const e of edges) {
      const du = e.b[0] - e.a[0], dv = e.b[1] - e.a[1];
      const len = Math.hypot(du, dv);
      const n = Math.max(2, Math.round(len / step));
      const base0 = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = e.a[0] + du * t, v = e.a[1] + dv * t;
        // inner rim, on the pad
        pos.push(u, 0.02, v);
        uvs.push(t * len * 0.10, 0);
        // outer rim, out on the terrain
        const ou = u + e.n[0] * W, ov = v + e.n[1] * W;
        const w = this._toWorldFlat(this.origin.x, this.origin.z, ou, ov);
        const y = Math.min(this.eco.height(w[0], w[1]) - this.base - 0.10, -0.12);
        pos.push(ou, y, ov);
        uvs.push(t * len * 0.10, W * 0.10);
      }
      for (let i = 0; i < n; i++) {
        const a = base0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    put(M.gravel, g, [0, 0, 0]);
  }

  /** Local (u, v) around an arbitrary origin -> world [x, z]. */
  _toWorldFlat(ox, oz, u, v) {
    // rotationY(yaw): (1,0,0) -> (cos, 0, -sin); (0,0,1) -> (sin, 0, cos)
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [ox + u * c + v * s, oz - u * s + v * c];
  }

  /** Local (u, y, v) -> world Vector3. */
  local(u, y, v, out = new THREE.Vector3()) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(
      this.origin.x + u * c + v * s,
      this.base + y,
      this.origin.z - u * s + v * c
    );
  }

  /** Hide the generic fuel stop `Outposts` built on this site. */
  _removePlaceholder(props) {
    const out = props && props.outposts;
    if (!out || !out.root) return;
    const dead = out.root.children.filter((c) => c.name === 'site_reststop');
    for (const g of dead) out.root.remove(g);
    if (out.groups) {
      out.groups = out.groups.filter((g) => g.group.name !== 'site_reststop');
    }
    // and its canopy point light, which sat at the old canopy's centre
    if (out.lights) {
      const d = this.site;
      out.lights = out.lights.filter((l) => {
        const near = Math.hypot(l.light.position.x - d.x, l.light.position.z - d.z) < 6;
        if (near) out.root.remove(l.light);
        return !near;
      });
    }
  }

  /* --------------------------------------------------------------- build */

  _build() {
    const M = this.mats = {
      asphalt: asphaltMaterial(),
      slab: slabMaterial(),
      gravel: gravelMaterial(),
      corr: corrugatedMaterial(0xb6ad96, 0.62, 0.35),
      corrRoof: corrugatedMaterial(0x8d8676, 0.68, 0.4),
      panel: panelMaterial(0xe0d7bc, 0.42, 0.5),
      panelRed: panelMaterial(0x9c3423, 0.40, 0.5),
      panelBlue: panelMaterial(0x33506a, 0.46, 0.42),
      panelCream: panelMaterial(0xcfc4a4, 0.46, 0.4),
      galv: galvMaterial(),
      scrap: scrapMaterial(0x8a5432),
      rubber: rubberMaterial(),
      wood: woodMaterial(0x7d6a4e),
      dark: panelMaterial(0x24262a, 0.6, 0.3),
      chrome: panelMaterial(0xc8ced6, 0.16, 0.95),
      glass: glassMaterial(0x121a20),
      glassDark: darkGlassMaterial(),
      canvas: panelMaterial(0x9c4632, 0.88, 0.02),
      paint: panelMaterial(0x6f6a5c, 0.96, 0.0),
      lamp: lampMaterial(0xffe6b4, 0x15130f),
      warm: lampMaterial(0xf0dcbc, 0x2a2620),
      neon: lampMaterial(0xffd07a, 0x1a1208),
      mesh: chainlinkMaterial(),
      signHH: signMaterial('hh', hammerheadSignTexture(), { emissive: 1 }),
      signCN: signMaterial('cn', crowsNestSignTexture(), { emissive: 1 }),
      signGA: signMaterial('ga', garageSignTexture()),
      signHB: signMaterial('hb', huntBoardTexture(), { rough: 0.9 }),
      signMB: signMaterial('mb', menuBoardTexture(), { emissive: 1 }),
      signRB: signMaterial('rb', rentABirdTexture()),
      signCM: signMaterial('cm', cullessTexture()),
    };
    for (const k of Object.keys(M)) if (!M[k].name) M[k].name = `hh_${k}`;

    const rng = this.rng = new Rng(90210);

    // Two builders: the shell (always drawn) and the clutter (culled far away).
    const S = new PartBuilder();
    const C = new PartBuilder();
    const putS = (m, g, p, r, sc) => S.add(m, g, this.world.clone().multiply(mat4(p, r, sc)));
    const putC = (m, g, p, r, sc) => C.add(m, g, this.world.clone().multiply(mat4(p, r, sc)));

    this._ground(putS, M);
    this._canopy(putS, putC, M, rng);
    this._pylon(putS, M);
    this._diner(putS, putC, M, rng);
    this._garage(putS, putC, M, rng);
    this._caravan(putS, putC, M);
    this._yard(putS, putC, M, rng);
    this._carPark(putS, putC, M, rng);
    this._streetFurniture(putS, putC, M, rng);
    this._lights(putS, M);

    this.shell = new THREE.Group();
    this.shell.name = 'hh_shell';
    S.build(this.shell, { cast: true, receive: true, name: 'hh' });
    this.root.add(this.shell);

    // Signage and glazing never cast: they are flat planes whose shadows read
    // as artefacts, and every caster costs a draw in each of three cascades.
    this._casters = this.shell.children.filter((m) => {
      const flat = /_sign_|_glass/.test(m.name);
      if (flat) m.castShadow = false;
      return !flat;
    });

    // The clutter pass is a hundred sub-metre objects. None of them casts —
    // between the buildings, the vehicles and the people there is already more
    // than enough shadow on this forecourt, and 14 merged meshes across three
    // cascades is 42 draw calls nobody would miss.
    this.clutter = new THREE.Group();
    this.clutter.name = 'hh_clutter';
    C.build(this.clutter, { cast: false, receive: true, name: 'hhc' });
    this.root.add(this.clutter);

    this.stats = {
      shellDraws: this.shell.children.length,
      clutterDraws: this.clutter.children.length,
      triangles: countTris(this.shell) + countTris(this.clutter),
    };
  }

  // ---- the ground the whole place stands on -----------------------------

  _ground(put, M) {
    const w = PAD.u1 - PAD.u0, d = PAD.v1 - PAD.v0;
    const cu = (PAD.u0 + PAD.u1) / 2, cv = (PAD.v0 + PAD.v1) / 2;

    // Graded pad: a deep slab so the cut side never shows daylight beneath.
    const padGeo = box(w, 8, d).clone();
    put(M.asphalt, uvScale(padGeo, w * 0.10, d * 0.10), [cu, -3.98, cv]);
    this._berm(put, M);
    // kerb lip round the tarmac
    for (const [px, pz, sx, sz] of [
      [cu, PAD.v0, w, 0.44], [cu, PAD.v1, w, 0.44],
      [PAD.u0, cv, 0.44, d], [PAD.u1, cv, 0.44, d],
    ]) {
      put(M.slab, box(sx, 0.24, sz), [px, 0.11, pz]);
    }

    // The apron flaring out to the highway — two throats of tarmac laid over
    // the berm so the town has an approach rather than an edge.
    // tilted so it ramps down onto the verge instead of ending in a step
    const throat = (u) => {
      put(M.asphalt, uvScale(box(13, 6, 12).clone(), 1.4, 1.3), [u, -3.55, PAD.v0 - 5.6], [0.09, 0, 0]);
    };
    throat(-13);
    throat(15);

    // Concrete hardstanding under the canopy, the diner and the garage.
    put(M.slab, uvScale(box(20, 0.34, 15).clone(), 2.2, 1.7), [-6, 0.16, -19]);
    put(M.slab, uvScale(box(17, 0.34, 13).clone(), 1.9, 1.5), [-16, 0.16, 3]);
    put(M.slab, uvScale(box(21, 0.36, 15).clone(), 2.3, 1.7), [13, 0.17, 3]);
    put(M.gravel, uvScale(box(26, 0.3, 13).clone(), 3.0, 1.6), [16, 0.13, 12]);

    // Painted bay markings for the car park, and the Regalia's own bay.
    const line = (u, v, len, yaw = 0, mat = M.paint) =>
      put(mat, box(0.12, 0.02, len), [u, 0.29, v], [0, yaw, 0]);
    for (let i = 0; i < 6; i++) line(-25 + i * 3.2, -6.6, 5.4);
    line(-25 + 6 * 3.2, -6.6, 5.4);
    put(M.paint, box(19.2, 0.02, 0.12), [-15.4, 0.29, -9.3]);
    // the Regalia bay, marked out wider and in a different hand
    for (const u of [3.2, 6.6]) line(u, -13.4, 6.2, 0, M.panelRed);
    put(M.panelRed, box(3.4, 0.02, 0.12), [4.9, 0.295, -16.5]);
  }

  // ---- fuel canopy and pumps --------------------------------------------

  _canopy(put, putC, M, rng) {
    const cu = -6, cv = -19;
    const deck = 5.35;
    // four columns
    for (const su of [-1, 1]) {
      for (const sv of [-1, 1]) {
        const u = cu + su * 6.3, v = cv + sv * 3.6;
        put(M.panelCream, box(0.5, deck, 0.5), [u, deck / 2 + 0.3, v]);
        put(M.slab, box(0.9, 0.42, 0.9), [u, 0.42, v]);
        put(M.galv, box(0.62, 0.10, 0.62), [u, deck + 0.32, v]);
      }
    }
    // deck: soffit, fascia band, roof
    put(M.panelCream, box(16.4, 0.55, 11.2), [cu, deck + 0.6, cv]);
    put(M.panelRed, box(16.8, 0.62, 11.6), [cu, deck + 1.16, cv]);
    put(M.panelCream, box(16.4, 0.14, 11.2), [cu, deck + 1.54, cv]);
    put(M.corrRoof, uvScale(box(16.9, 0.10, 11.7).clone(), 2.6, 1.8), [cu, deck + 1.62, cv]);
    // Soffit. A fuel canopy at night is a glowing white ceiling — hung
    // beneath the deck, not flush with it, or the panels vanish inside the
    // slab they are supposed to be lighting.
    for (let i = -2; i <= 2; i++) {
      put(M.lamp, box(3.1, 0.12, 2.6), [cu + i * 3.3, deck + 0.20, cv]);
      put(M.galv, box(3.3, 0.05, 2.8), [cu + i * 3.3, deck + 0.28, cv]);
    }
    for (const sv of [-1, 1]) {
      put(M.lamp, box(14.2, 0.10, 0.5), [cu, deck + 0.22, cv + sv * 4.5]);
    }
    // a hanging price plate under the near edge
    put(M.dark, box(2.4, 0.9, 0.12), [cu + 6.0, deck - 0.42, cv - 5.6]);
    put(M.neon, box(2.1, 0.62, 0.06), [cu + 6.0, deck - 0.42, cv - 5.68]);

    // two pump islands
    for (const sv of [-1, 1]) {
      const v = cv + sv * 3.3;
      put(M.slab, box(9.2, 0.36, 2.0), [cu, 0.44, v]);
      put(M.panelCream, box(9.2, 0.12, 2.0), [cu, 0.63, v]);
      for (const su of [-1, 1]) {
        const u = cu + su * 2.5;
        // pump body, head, display, hose and nozzle boot
        put(M.panelCream, box(0.82, 1.62, 0.62), [u, 1.44, v]);
        put(M.panelRed, box(0.88, 0.24, 0.68), [u, 2.32, v]);
        put(M.dark, box(0.52, 0.34, 0.10), [u, 1.94, v + sv * 0.34]);
        put(M.neon, box(0.44, 0.26, 0.04), [u, 1.94, v + sv * 0.39]);
        put(M.galv, box(0.10, 0.10, 0.72), [u, 2.52, v], [0, 0, 0]);
        putC(M.dark, cyl(0.028, 0.028, 1.5, 6), [u + 0.46, 1.55, v + sv * 0.2], [0.5, 0, 0.7]);
        putC(M.dark, box(0.12, 0.26, 0.10), [u + 0.52, 0.95, v + sv * 0.3], [0, 0, 0.2]);
        // bollard
        putC(M.panelRed, cyl(0.11, 0.13, 0.95, 8), [u + 1.5, 0.68, v + sv * 0.75]);
      }
    }
    // air-and-water pillar and a bin at the island end
    putC(M.panelBlue, box(0.6, 1.35, 0.5), [cu + 7.4, 1.0, cv - 3.3]);
    putC(M.galv, cyl(0.10, 0.10, 0.5, 8), [cu + 7.4, 1.9, cv - 3.3]);
    putC(M.dark, cyl(0.34, 0.30, 1.0, 12), [cu - 7.6, 0.8, cv - 3.4]);
    putC(M.galv, torus(0.34, 0.03, 5, 14), [cu - 7.6, 1.28, cv - 3.4], [Math.PI / 2, 0, 0]);
    // a screen-wash bucket and a squeegee, because somebody always leaves one
    putC(M.panelBlue, cyl(0.16, 0.13, 0.32, 10), [cu - 7.0, 0.46, cv - 2.4]);
    putC(M.galv, cyl(0.02, 0.02, 0.9, 5), [cu - 7.0, 0.9, cv - 2.4], [0.2, 0, 0.16]);

    this.anchors.pump = this.local(cu + 2.5, 1.3, cv - 3.3);
  }

  // ---- the pylon sign ----------------------------------------------------

  _pylon(put, M) {
    const u = -25.5, v = -27.5;
    put(M.galv, cyl(0.26, 0.36, 11.6, 10), [u, 5.8, v]);
    put(M.slab, box(1.7, 0.6, 1.7), [u, 0.4, v]);
    // sign box: the face reads along the highway, so it turns with +/- u
    put(M.panelCream, box(0.72, 4.4, 6.0), [u, 13.4, v]);
    put(M.panelRed, box(0.86, 0.34, 6.2), [u, 15.75, v]);
    put(M.panelRed, box(0.86, 0.34, 6.2), [u, 11.05, v]);
    const face = plane(5.7, 4.1);
    put(M.signHH, face, [u - 0.38, 13.4, v], [0, -Math.PI / 2, 0]);
    put(M.signHH, face, [u + 0.38, 13.4, v], [0, Math.PI / 2, 0]);
    // gantry lamps over the top edge
    for (const s of [-1, 0, 1]) {
      put(M.galv, cyl(0.05, 0.05, 0.8, 6), [u, 16.1, v + s * 2.0], [0.4, 0, 0]);
      put(M.lamp, box(0.5, 0.10, 0.34), [u - 0.28, 16.42, v + s * 2.0]);
    }
    this.anchors.pylon = this.local(u, 0, v);
  }

  // ---- the Crow's Nest ---------------------------------------------------

  _diner(put, putC, M, rng) {
    const cu = -16, cv = 3.6;
    const W = 14.4, D = 9.6, H = 3.9;

    // shell: corrugated side and back walls, glass frontage facing -v
    put(M.corr, uvScale(box(W, H, 0.34).clone(), 3.6, 1.0), [cu, H / 2 + 0.3, cv + D / 2]);
    for (const su of [-1, 1]) {
      put(M.corr, uvScale(box(0.34, H, D).clone(), 2.4, 1.0), [cu + su * W / 2, H / 2 + 0.3, cv]);
    }
    // frontage: a low cream stub wall, then glass to the eaves
    put(M.panelCream, box(W, 1.05, 0.3), [cu, 0.82, cv - D / 2]);
    put(M.glass, box(W - 0.7, 2.3, 0.10), [cu, 2.55, cv - D / 2]);
    // mullions
    for (let i = -3; i <= 3; i++) put(M.panelCream, box(0.14, 2.4, 0.18), [cu + i * 1.95, 2.55, cv - D / 2 - 0.02]);
    put(M.panelCream, box(W, 0.34, 0.34), [cu, 3.86, cv - D / 2]);
    // door in the frontage
    put(M.dark, box(1.15, 2.2, 0.14), [cu + 4.2, 1.4, cv - D / 2 - 0.06]);
    put(M.chrome, cyl(0.035, 0.035, 1.0, 6), [cu + 3.8, 1.35, cv - D / 2 - 0.14]);

    // roof: shallow pitch with a deep front eave and a fascia sign
    put(M.corrRoof, uvScale(box(W + 1.2, 0.34, D + 1.4).clone(), 3.4, 2.2), [cu, H + 0.46, cv], [0.05, 0, 0]);
    put(M.panelCream, box(W + 1.2, 0.9, 0.30), [cu, H + 0.92, cv - D / 2 - 0.6]);
    put(M.signCN, plane(6.4, 2.3), [cu - 2.2, H + 1.62, cv - D / 2 - 0.72], [0, Math.PI, 0]);
    put(M.panelRed, box(W + 1.4, 0.30, 0.42), [cu, H + 2.86, cv - D / 2 - 0.62]);

    // porch over the door and the seating
    for (const su of [-1, 1]) {
      put(M.galv, cyl(0.075, 0.075, 3.0, 8), [cu + su * 5.4, 1.8, cv - D / 2 - 3.2]);
    }
    put(M.corrRoof, uvScale(box(12.4, 0.14, 3.6).clone(), 2.4, 0.8), [cu, 3.32, cv - D / 2 - 1.7], [0.10, 0, 0]);
    put(M.panelRed, box(12.6, 0.26, 0.16), [cu, 3.14, cv - D / 2 - 3.42]);

    // interior read: counter, stools, menu board, a warm ceiling glow
    put(M.wood, box(9.6, 1.06, 0.8), [cu - 1.4, 0.86, cv - 1.6]);
    put(M.chrome, box(9.6, 0.08, 0.94), [cu - 1.4, 1.42, cv - 1.6]);
    for (let i = 0; i < 6; i++) {
      putC(M.chrome, cyl(0.05, 0.05, 0.68, 8), [cu - 5.4 + i * 1.6, 0.64, cv - 2.5]);
      putC(M.panelRed, cyl(0.24, 0.24, 0.12, 12), [cu - 5.4 + i * 1.6, 1.03, cv - 2.5]);
    }
    put(M.signMB, plane(4.6, 2.3), [cu - 1.4, 2.62, cv + 1.9], [0, Math.PI, 0]);
    put(M.dark, box(5.0, 2.6, 0.16), [cu - 1.4, 2.62, cv + 2.0]);
    // galley kit behind the counter
    put(M.chrome, box(4.4, 1.0, 0.86), [cu + 3.2, 0.83, cv + 1.2]);
    putC(M.dark, box(1.5, 0.9, 0.72), [cu + 5.6, 0.78, cv + 1.2]);
    putC(M.galv, box(2.0, 0.06, 0.5), [cu + 3.2, 2.10, cv + 2.1]);
    for (let i = 0; i < 5; i++) putC(M.chrome, cyl(0.05, 0.05, 0.34, 6), [cu + 2.4 + i * 0.4, 1.9, cv + 2.1]);
    // ceiling strip lights, seen through the glass at night
    for (const su of [-1, 1]) put(M.lamp, box(6.4, 0.12, 0.42), [cu + su * 3.2, 3.9, cv - 1.0]);
    // A warm card filling the back of the room. Without it the frontage is a
    // black rectangle from outside at every hour of the day, which is the one
    // thing a diner window must never be.
    put(M.warm, box(W - 1.2, 2.9, 0.10), [cu, 2.2, cv + D / 2 - 0.36]);
    // booths against the window
    for (let i = 0; i < 3; i++) {
      const u = cu - 5.2 + i * 3.4;
      putC(M.panelRed, box(1.5, 0.5, 0.62), [u, 0.72, cv - 3.6]);
      putC(M.panelRed, box(1.5, 1.0, 0.24), [u, 1.16, cv - 3.9]);
      putC(M.wood, box(1.3, 0.07, 0.9), [u, 0.98, cv - 4.4]);
      putC(M.galv, cyl(0.05, 0.05, 0.95, 6), [u, 0.5, cv - 4.4]);
    }

    // the hunt board, bolted to the frontage right of the door
    const hbU = cu + 6.1, hbV = cv - D / 2 - 0.22;
    put(M.wood, box(2.9, 2.2, 0.16), [hbU, 1.72, hbV]);
    put(M.signHB, plane(2.6, 1.9), [hbU, 1.74, hbV - 0.10], [0, Math.PI, 0]);
    put(M.corrRoof, box(3.2, 0.10, 0.6), [hbU, 2.95, hbV - 0.24], [0.24, 0, 0]);
    this.anchors.huntBoard = this.local(hbU, 0, hbV - 1.4);
    this.anchors.dinerCounter = this.local(cu - 1.4, 0, cv - 2.9);
    this.anchors.dinerDoor = this.local(cu + 4.2, 0, cv - D / 2 - 1.6);

    // outdoor seating on the apron
    patioSet(putC, M, [cu - 6.6, cv - D / 2 - 5.6], { yaw: 0.16 });
    patioSet(putC, M, [cu - 1.4, cv - D / 2 - 6.1], { yaw: -0.24 });
    patioSet(putC, M, [cu + 3.8, cv - D / 2 - 5.4], { yaw: 0.34, parasol: false });
    // a vending machine and an ice chest against the stub wall
    putC(M.panelRed, box(0.9, 1.85, 0.72), [cu - 6.4, 1.22, cv - D / 2 + 0.5]);
    putC(M.neon, box(0.66, 1.2, 0.05), [cu - 6.4, 1.42, cv - D / 2 + 0.12]);
    putC(M.panelBlue, box(1.25, 0.95, 0.8), [cu - 5.1, 0.78, cv - D / 2 + 0.5]);
    // gas bottles and a stack of crates by the back door
    for (let i = 0; i < 3; i++) {
      putC(M.panelBlue, cyl(0.16, 0.16, 0.62, 10), [cu + W / 2 - 1.1 - i * 0.42, 0.62, cv + D / 2 + 0.9]);
    }
    palletStack(putC, M, [cu - W / 2 + 1.4, cv + D / 2 + 1.2], { yaw: 0.3, n: 2, rng });
  }

  // ---- Cid's garage ------------------------------------------------------

  _garage(put, putC, M, rng) {
    const cu = 13, cv = 3.4;
    const W = 18.0, D = 12.0, H = 5.6;

    // shell
    put(M.corr, uvScale(box(W, H, 0.4).clone(), 4.5, 1.4), [cu, H / 2 + 0.35, cv + D / 2]);
    for (const su of [-1, 1]) {
      put(M.corr, uvScale(box(0.4, H, D).clone(), 3.0, 1.4), [cu + su * W / 2, H / 2 + 0.35, cv]);
    }
    // front: two roller-door bays with a pier between and a side office
    const front = cv - D / 2;
    put(M.corr, uvScale(box(W, 1.5, 0.4).clone(), 4.5, 0.4), [cu, H + 0.05, front]);
    put(M.corr, uvScale(box(1.0, H, 0.4).clone(), 0.34, 1.4), [cu, H / 2 + 0.35, front]);
    for (const su of [-1, 1]) {
      put(M.corr, uvScale(box(1.0, H, 0.4).clone(), 0.34, 1.4), [cu + su * (W / 2 - 0.5), H / 2 + 0.35, front]);
    }
    // bay 1 (u < 0): roller door rolled up into its drum — you can see inside
    const b1 = cu - 5.0, b2 = cu + 5.0;
    put(M.galv, cyl(0.26, 0.26, 6.6, 12), [b1, 4.78, front + 0.05], [0, 0, Math.PI / 2]);
    put(M.panelBlue, box(6.5, 0.55, 0.10), [b1, 4.42, front - 0.06]);
    // bay 2: door two-thirds down, slats reading as horizontal ribs
    put(M.panelBlue, uvScale(box(6.5, 3.1, 0.12).clone(), 1.0, 6.0), [b2, 3.15, front - 0.06]);
    for (let i = 0; i < 9; i++) put(M.galv, box(6.5, 0.05, 0.05), [b2, 1.72 + i * 0.34, front - 0.14]);
    put(M.galv, cyl(0.26, 0.26, 6.6, 12), [b2, 4.78, front + 0.05], [0, 0, Math.PI / 2]);
    put(M.dark, box(6.5, 1.6, 0.14), [b2, 0.95, front + 0.36]);

    // roof: mono-pitch falling to the back, with a ridge vent
    put(M.corrRoof, uvScale(box(W + 1.0, 0.36, D + 1.2).clone(), 4.4, 3.0), [cu, H + 1.0, cv], [-0.06, 0, 0]);
    put(M.galv, box(W - 2.0, 0.5, 1.1), [cu, H + 1.5, cv - 1.0]);
    put(M.galv, box(W + 1.2, 0.16, 0.22), [cu, H + 0.74, front - 0.6]);
    // fascia sign over the pier
    put(M.signGA, plane(6.0, 1.7), [cu, H + 0.72, front - 0.24], [0, Math.PI, 0]);
    // office window and door on the -u end wall
    put(M.glassDark, box(0.08, 1.15, 2.6), [cu - W / 2 - 0.18, 2.4, cv + 3.0]);
    put(M.galv, box(0.10, 1.25, 0.10), [cu - W / 2 - 0.2, 2.4, cv + 3.0]);
    put(M.dark, box(0.12, 2.1, 1.0), [cu - W / 2 - 0.2, 1.4, cv - 1.4]);

    // interior: car lift with a car on it, benches, racks, a compressor
    put(M.slab, uvScale(box(W - 1.0, 0.2, D - 1.0).clone(), 2.2, 1.5), [cu, 0.42, cv]);
    put(M.galv, box(3.4, 0.34, 0.6), [b1, 1.9, cv + 0.6]);
    for (const su of [-1, 1]) put(M.galv, box(0.4, 1.9, 0.4), [b1 + su * 1.5, 1.0, cv + 0.6]);
    carShell(putC, M, [b1, cv + 0.6], { y: 2.05, yaw: Math.PI, body: M.panelBlue, wreck: false });
    // work benches along the back wall with tool clutter
    put(M.galv, box(W - 3.0, 0.12, 0.8), [cu, 1.0, cv + D / 2 - 0.7]);
    for (let i = 0; i < 6; i++) put(M.galv, box(0.1, 0.94, 0.1), [cu - 6.5 + i * 2.6, 0.5, cv + D / 2 - 0.7]);
    // pegboard of hand tools
    put(M.dark, box(6.4, 2.0, 0.08), [cu - 3.0, 2.3, cv + D / 2 - 0.28]);
    for (let i = 0; i < 22; i++) {
      const u = cu - 5.9 + (i % 11) * 0.58;
      const y = 1.7 + Math.floor(i / 11) * 0.86;
      putC(M.chrome, box(0.06, rng.range(0.24, 0.5), 0.05), [u, y, cv + D / 2 - 0.34], [0, 0, rng.gauss(0, 0.14)]);
    }
    // tool chest, compressor, welding set, an engine on a stand
    putC(M.panelRed, box(1.3, 1.0, 0.66), [cu + 3.2, 0.92, cv + D / 2 - 0.9]);
    for (let i = 0; i < 4; i++) putC(M.chrome, box(1.24, 0.03, 0.6), [cu + 3.2, 0.55 + i * 0.24, cv + D / 2 - 1.22]);
    putC(M.panelBlue, cyl(0.26, 0.26, 1.1, 12), [cu + 6.4, 0.97, cv + D / 2 - 1.0], [Math.PI / 2, 0, 0]);
    putC(M.galv, box(0.7, 0.5, 0.7), [cu + 6.4, 1.7, cv + D / 2 - 1.0]);
    putC(M.galv, box(0.5, 0.9, 0.5), [cu + 7.8, 0.87, cv + 2.0]);
    putC(M.scrap, box(0.9, 0.8, 0.85), [cu + 1.0, 1.35, cv + 2.4]);
    putC(M.galv, box(0.12, 1.0, 0.12), [cu + 1.0, 0.5, cv + 2.4]);
    putC(M.galv, box(1.0, 0.1, 1.0), [cu + 1.0, 0.06, cv + 2.4]);
    // creeper, jack, oil pan, a coil of airline
    putC(M.panelRed, box(1.5, 0.12, 0.5), [b2, 0.5, cv - 2.0], [0, 0.4, 0]);
    putC(M.scrap, box(0.9, 0.34, 0.36), [b2 - 1.6, 0.6, cv - 1.0], [0, 0.2, 0]);
    putC(M.dark, cyl(0.42, 0.42, 0.1, 12), [b1 + 2.0, 0.48, cv - 1.6]);
    putC(M.dark, torus(0.42, 0.06, 5, 14), [cu + 7.6, 1.6, cv + D / 2 - 0.5], [0, 0, 0]);
    // strip lights in the roof — the garage glows at night, and by day they
    // are the only reason the open bay is not a black rectangle
    for (const su of [-1, 1]) {
      put(M.lamp, box(6.6, 0.14, 0.55), [cu + su * 4.6, H + 0.42, cv - 1.4]);
      put(M.lamp, box(6.6, 0.14, 0.55), [cu + su * 4.6, H + 0.42, cv + 3.0]);
      put(M.galv, box(6.8, 0.05, 0.7), [cu + su * 4.6, H + 0.52, cv - 1.4]);
      put(M.galv, box(6.8, 0.05, 0.7), [cu + su * 4.6, H + 0.52, cv + 3.0]);
    }
    // a pale card on the back wall so daylight through the door finds something
    put(M.warm, box(W - 2.2, 3.2, 0.08), [cu, 2.1, cv + D / 2 - 0.32]);

    this.anchors.garageCounter = this.local(cu - W / 2 + 1.6, 0, cv - D / 2 - 1.8);
    this.anchors.garageBay = this.local(b1, 0, front - 2.2);
    this.anchors.garageInside = this.local(b2 - 1.0, 0, cv + 1.4);
  }

  // ---- the caravan -------------------------------------------------------

  _caravan(put, putC, M) {
    const cu = 23.0, cv = -14.5, yaw = 0.30;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (m, g, u, y, v, rot = [0, 0, 0]) => put(m, g,
      [cu + u * c + v * s, y, cv - u * s + v * c], [rot[0], yaw + rot[1], rot[2]]);
    const PC = (m, g, u, y, v, rot = [0, 0, 0]) => putC(m, g,
      [cu + u * c + v * s, y, cv - u * s + v * c], [rot[0], yaw + rot[1], rot[2]]);

    // Body. Squatter than the first pass — a caravan roof sits at about 2.9 m,
    // and a slab any taller reads as a shipping container with a stripe on it.
    // The stepped roof and the chamfered top edge stand in for the rounded
    // corners a real touring van has.
    P(M.panel, box(7.6, 1.96, 2.72), 0, 1.44, 0);
    P(M.panel, box(7.2, 0.30, 2.44), 0, 2.52, 0);
    P(M.panel, box(6.4, 0.20, 2.60), 0, 2.62, 0);
    P(M.panelRed, box(7.66, 0.20, 2.78), 0, 1.90, 0);
    P(M.panelRed, box(7.66, 0.08, 2.78), 0, 1.72, 0);
    P(M.corr, box(7.64, 0.42, 2.76), 0, 0.55, 0);
    // windows down the long side, door and step
    for (let i = -1; i <= 1; i++) P(M.glassDark, box(1.45, 0.78, 0.08), i * 2.2 - 0.5, 1.86, -1.39);
    for (let i = -1; i <= 1; i++) P(M.chrome, box(1.55, 0.06, 0.05), i * 2.2 - 0.5, 1.48, -1.40);
    P(M.dark, box(0.88, 1.66, 0.10), 2.7, 1.34, -1.39);
    P(M.glassDark, box(0.66, 0.5, 0.06), 2.7, 1.88, -1.45);
    P(M.chrome, cyl(0.03, 0.03, 0.42, 6), 2.32, 1.30, -1.47, [0, 0, Math.PI / 2]);
    P(M.galv, box(1.0, 0.09, 0.62), 2.7, 0.56, -1.82);
    P(M.galv, box(1.0, 0.09, 0.62), 2.7, 0.28, -1.92);
    // wheels, jack legs and a tow hitch
    for (const u of [-1.5, 1.3]) P(M.rubber, wheel(0.40, 0.26, 14), u, 0.40, 1.42, [0, Math.PI / 2, 0]);
    for (const [u, v] of [[-3.5, -1.2], [-3.5, 1.2], [3.5, -1.2], [3.5, 1.2]]) {
      P(M.galv, cyl(0.055, 0.055, 0.42, 6), u, 0.21, v);
      P(M.galv, box(0.26, 0.06, 0.26), u, 0.02, v);
    }
    P(M.galv, box(1.5, 0.14, 0.14), -4.3, 0.62, 0);
    P(M.galv, cyl(0.085, 0.085, 0.28, 8), -4.9, 0.54, 0);
    // Awning: a proper pitched sheet on two rafters, rolled out of a housing on
    // the van's flank rather than a plank floating in mid-air.
    P(M.galv, cyl(0.10, 0.10, 5.2, 8), 1.6, 2.28, -1.30, [0, Math.PI / 2, 0]);
    for (const u of [-0.7, 3.9]) {
      P(M.galv, cyl(0.032, 0.032, 2.10, 6), u, 1.05, -3.35);
      P(M.galv, box(0.05, 0.05, 2.30), u, 2.15, -2.34, [0.16, 0, 0]);
    }
    P(M.canvas, box(4.7, 0.05, 2.34), 1.6, 2.16, -2.34, [0.16, 0, 0]);
    P(M.canvas, box(4.7, 0.16, 0.05), 1.6, 2.00, -3.38);
    P(M.lamp, box(0.30, 0.10, 0.22), 2.7, 2.20, -1.50);
    PC(M.panelBlue, box(0.56, 0.08, 0.52), 1.9, 0.52, -2.9);
    PC(M.panelBlue, box(0.56, 0.5, 0.06), 1.9, 0.78, -3.14);
    for (const [du, dv] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
      PC(M.galv, cyl(0.02, 0.02, 0.5, 5), 1.9 + du, 0.26, -2.9 + dv);
    }
    PC(M.wood, cyl(0.36, 0.36, 0.05, 12), 3.9, 0.68, -2.9);
    PC(M.galv, cyl(0.04, 0.04, 0.66, 6), 3.9, 0.34, -2.9);
    PC(M.panelBlue, cyl(0.14, 0.14, 0.55, 10), 4.4, 0.30, -3.4);

    this.anchors.caravan = this.local(cu + 2.7 * c + (-2.9) * s, 0, cv - 2.7 * s + (-2.9) * c);
    this.anchors.caravanDoor = this.anchors.caravan.clone();
  }

  // ---- the parts yard ----------------------------------------------------

  _yard(put, putC, M, rng) {
    const F = { u0: 3.5, u1: 28.5, v0: 10.0, v1: 16.5 };
    fenceRun(put, M, [F.u0, F.v1], [F.u1, F.v1]);
    fenceRun(put, M, [F.u1, F.v0], [F.u1, F.v1]);
    fenceRun(put, M, [F.u0, F.v0 + 4.2], [F.u0, F.v1]);
    // and a run along the far side of the whole pad, behind the diner
    fenceRun(put, M, [-27, 14.5], [-4, 14.5]);
    fenceRun(put, M, [-27, 14.5], [-27, 2.0]);

    // tyre mountain, drums, scrap and a dead car
    tyreStack(putC, M, [6.0, 13.0], { n: 6, rng });
    tyreStack(putC, M, [7.3, 13.4], { n: 4, rng });
    tyreStack(putC, M, [6.6, 14.6], { n: 7, rng });
    tyreStack(putC, M, [-19.5, -6.0], { n: 4, rng });
    tyreStack(putC, M, [20.0, -8.6], { n: 3, rng });
    for (const [u, v, tip] of [[10.5, 13.2, false], [11.4, 14.4, false], [12.4, 13.0, true], [10.2, 15.2, false]]) {
      drum(putC, M, [u, v], { tipped: tip, yaw: rng.next() * 3 });
    }
    drum(putC, M, [-9.4, -1.0], { mat: M.panelBlue });
    drum(putC, M, [-8.5, -1.4], {});
    carShell(putC, M, [22.0, 13.4], { yaw: 0.7, body: M.scrap, wreck: true });
    palletStack(putC, M, [16.0, 14.8], { yaw: 0.2, n: 3, rng });
    palletStack(putC, M, [17.6, 13.2], { yaw: -0.5, n: 1, rng });
    // scrap panels leaning on the fence, an axle, a fuel tank
    for (let i = 0; i < 6; i++) {
      const u = 24.5 + rng.gauss(0, 1.4), v = 15.4 + rng.gauss(0, 0.5);
      putC(M.scrap, box(rng.range(1.0, 2.2), rng.range(1.2, 2.0), 0.06), [u, 0.9, v], [0, rng.gauss(0, 0.3), rng.gauss(0.2, 0.1)]);
    }
    putC(M.scrap, cyl(0.14, 0.14, 2.4, 8), [14.0, 0.2, 12.4], [0, 0.4, Math.PI / 2]);
    putC(M.scrap, cyl(0.62, 0.62, 2.2, 12), [26.4, 0.7, 11.6], [0, 0, Math.PI / 2]);
    // Rent-a-Bird stand: a sign, a rail and a feed trough. Never built out —
    // exactly the kind of named-but-absent detail that makes a world read large.
    put(M.galv, cyl(0.09, 0.09, 3.0, 8), [26.0, 1.5, 6.6]);
    put(M.signRB, plane(2.0, 2.0), [26.0, 3.4, 6.6], [0, Math.PI + 0.4, 0]);
    putC(M.wood, box(0.12, 0.12, 5.0), [24.4, 1.05, 6.6], [0, 0.4, 0]);
    for (const v of [4.4, 8.8]) putC(M.wood, cyl(0.08, 0.09, 1.1, 6), [24.4, 0.55, v]);
    putC(M.galv, box(1.5, 0.32, 0.5), [24.9, 0.32, 6.2], [0, 0.4, 0]);
  }

  // ---- parked vehicles ---------------------------------------------------

  _carPark(put, putC, M, rng) {
    // Nose-in to the bays, clear of the diner porch — a car parked across the
    // door is the fastest way to make a lot read as a render rather than a
    // place somebody actually uses.
    carShell(putC, M, [-23.4, -6.6], { yaw: 0.02, body: M.panelRed });
    carShell(putC, M, [-20.2, -6.6], { yaw: -0.03, body: M.panelCream });
    carShell(putC, M, [-13.6, -6.8], { yaw: 0.05, body: M.panelBlue });
    carShell(putC, M, [19.0, -6.0], { yaw: 1.62, body: M.dark, len: 5.0 });

    // a flatbed truck at the garage mouth, which is what a garage looks like
    const tu = 22.5, tv = -1.5, ty = 1.62;
    put(M.panelCream, box(2.3, 1.5, 2.4), [tu, ty, tv - 2.2]);
    put(M.glass, box(2.16, 0.8, 0.12), [tu, ty + 0.32, tv - 3.36]);
    put(M.scrap, box(2.4, 0.5, 5.4), [tu, 1.0, tv + 0.6]);
    put(M.scrap, box(2.5, 0.9, 0.14), [tu, 1.66, tv + 3.24]);
    for (const s of [-1, 1]) put(M.scrap, box(0.14, 0.9, 5.2), [tu + s * 1.2, 1.66, tv + 0.6]);
    for (const [du, dv] of [[-1.15, -2.4], [1.15, -2.4], [-1.15, 1.6], [1.15, 1.6], [-1.15, 2.6], [1.15, 2.6]]) {
      put(M.rubber, wheel(0.55, 0.32, 14), [tu + du, 0.55, tv + dv], [0, Math.PI / 2, 0]);
    }
    palletStack(putC, M, [tu, tv + 1.0], { yaw: 0.1, n: 2, rng });

    // Culless Munitions van, backed onto the lot edge with its shutter up
    const vu = -26.0, vv = -14.5, vyaw = -0.5;
    const c = Math.cos(vyaw), s = Math.sin(vyaw);
    const V = (m, g, u, y, v, rot = [0, 0, 0]) => put(m, g,
      [vu + u * c + v * s, y, vv - u * s + v * c], [rot[0], vyaw + rot[1], rot[2]]);
    V(M.panelBlue, box(2.4, 2.3, 5.4), 0, 1.75, 0);
    V(M.panelBlue, box(2.2, 1.2, 1.6), 0, 1.5, -3.2);
    V(M.glass, box(2.06, 0.8, 0.12), 0, 1.66, -3.95);
    V(M.signCM, plane(4.6, 1.7), 1.22, 1.9, 0.2, [0, Math.PI / 2, 0]);
    V(M.dark, box(2.3, 1.7, 0.10), 0, 1.5, 2.72);
    V(M.galv, box(2.3, 0.9, 0.10), 0, 3.24, 2.5, [0.7, 0, 0]);
    for (const [du, dv] of [[-1.2, -2.2], [1.2, -2.2], [-1.2, 1.8], [1.2, 1.8]]) {
      V(M.rubber, wheel(0.42, 0.26, 14), du, 0.42, dv, [0, Math.PI / 2, 0]);
    }
    // a trestle of stock beside the tailgate
    V(M.wood, box(2.0, 0.1, 0.8), 0, 0.95, 3.9);
    for (const du of [-0.8, 0.8]) V(M.galv, box(0.08, 0.9, 0.08), du, 0.48, 3.9);
    for (let i = 0; i < 5; i++) V(M.chrome, box(0.08, 0.08, 0.9), -0.7 + i * 0.34, 1.06, 3.9, [Math.PI / 2, 0, 0]);
    this.anchors.culless = this.local(vu + 3.4 * s, 0, vv + 3.4 * c);
  }

  // ---- everything else that makes it look lived in -----------------------

  _streetFurniture(put, putC, M, rng) {
    // telegraph pole feeding the site, with a stay wire
    put(M.wood, cyl(0.18, 0.24, 9.0, 8), [-27.5, 4.5, -20.0]);
    put(M.wood, box(0.14, 0.14, 2.4), [-27.5, 8.4, -20.0]);
    for (const s of [-1, 1]) put(M.galv, cyl(0.05, 0.05, 0.3, 6), [-27.5, 8.62, -20.0 + s * 0.9]);
    // a payphone and a noticeboard by the diner path
    putC(M.dark, box(0.52, 0.86, 0.34), [-9.0, 1.62, -6.0]);
    putC(M.panelBlue, box(0.60, 0.30, 0.42), [-9.0, 2.10, -6.0]);
    putC(M.chrome, box(0.16, 0.28, 0.10), [-9.15, 1.66, -6.20]);
    putC(M.galv, cyl(0.055, 0.055, 2.1, 8), [-9.0, 1.05, -6.0]);
    putC(M.wood, box(1.55, 1.15, 0.10), [-6.4, 1.62, -6.0]);
    putC(M.dark, box(1.35, 0.95, 0.04), [-6.4, 1.62, -6.06]);
    putC(M.panelCream, box(1.15, 0.75, 0.02), [-6.4, 1.66, -6.09], [0, 0, 0.03]);
    putC(M.corrRoof, box(1.75, 0.06, 0.42), [-6.4, 2.26, -6.12], [0.28, 0, 0]);
    for (const s of [-1, 1]) putC(M.wood, box(0.09, 2.1, 0.09), [-6.4 + s * 0.66, 1.05, -6.0]);
    // bins, a hose reel, a pallet of oil cans, a stack of crates
    putC(M.dark, cyl(0.36, 0.32, 1.05, 12), [-2.0, 0.82, -9.0]);
    putC(M.dark, cyl(0.36, 0.32, 1.05, 12), [-1.0, 0.82, -9.2]);
    putC(M.scrap, torus(0.34, 0.09, 6, 14), [4.0, 1.05, 8.0], [0, 0.4, 0]);
    putC(M.galv, box(0.12, 1.1, 0.12), [4.0, 0.55, 8.0]);
    palletStack(putC, M, [1.2, 8.6], { yaw: -0.2, n: 2, rng });
    for (let i = 0; i < 8; i++) {
      putC(M.panelRed, cyl(0.09, 0.09, 0.26, 8), [0.7 + (i % 4) * 0.22, 1.05 + Math.floor(i / 4) * 0.27, 8.4]);
    }
    // scattered litter and dropped tools, seeded so it never re-rolls
    for (let i = 0; i < 26; i++) {
      const u = rng.range(PAD.u0 + 2, PAD.u1 - 2);
      const v = rng.range(PAD.v0 + 2, PAD.v1 - 2);
      const r = rng.next();
      if (r < 0.4) putC(M.scrap, box(rng.range(0.1, 0.3), 0.04, rng.range(0.1, 0.26)), [u, 0.32, v], [0, rng.next() * 3, 0]);
      else if (r < 0.7) putC(M.wood, box(rng.range(0.3, 0.8), 0.06, rng.range(0.1, 0.2)), [u, 0.33, v], [0, rng.next() * 3, 0]);
      else putC(M.rubber, torus(0.34, 0.13, 5, 10), [u, 0.36, v], [Math.PI / 2, 0, rng.next() * 3]);
    }
    // a fire point and a No Smoking plate on the canopy column
    putC(M.panelRed, cyl(0.13, 0.13, 0.55, 10), [-12.6, 0.6, -16.0]);
    putC(M.panelRed, cyl(0.13, 0.13, 0.55, 10), [-12.3, 0.6, -16.4]);
    putC(M.panelCream, box(0.42, 0.42, 0.04), [-12.3, 1.9, -15.4]);
  }

  // ---- lighting ----------------------------------------------------------

  _lights(put, M) {
    const masts = [
      [[-25.0, -12.0], 0.0], [[-25.5, 8.0], 0.2],
      [[2.0, -27.0], 0.0], [[26.0, -22.0], 0.4], [[27.0, 8.0], -0.3],
    ];
    for (const [pos, yaw] of masts) {
      const head = floodMast(put, M, pos, { height: 8.6, heads: 2, yaw });
      const w = this.local(head[0], head[1], head[2]);
      const l = new THREE.PointLight(0xffe0ae, 0, 34, 2);
      l.position.copy(w);
      this.root.add(l);
      this.lights.push({ light: l, night: 12 });
    }
    // canopy underlight — the brightest thing for a kilometre after dark
    const canopy = this.local(-6, 4.9, -19);
    const cl = new THREE.PointLight(0xfff0cc, 0, 40, 2);
    cl.position.copy(canopy);
    this.root.add(cl);
    this.lights.push({ light: cl, night: 34, day: 0 });
    // diner interior glow spilling out of the frontage
    const diner = this.local(-16, 2.6, -0.4);
    const dl = new THREE.PointLight(0xffd9a0, 0, 26, 2);
    dl.position.copy(diner);
    this.root.add(dl);
    this.lights.push({ light: dl, night: 16, day: 2.0 });
    // garage bay, warm and low
    const gar = this.local(8, 2.4, 2.0);
    const gl = new THREE.PointLight(0xffe2b0, 0, 24, 2);
    gl.position.copy(gar);
    this.root.add(gl);
    this.lights.push({ light: gl, night: 13, day: 1.6 });
    // the pylon sign lights itself
    const pl = new THREE.PointLight(0xffe9c4, 0, 22, 2);
    pl.position.copy(this.local(-25.5, 13.4, -27.5));
    this.root.add(pl);
    this.lights.push({ light: pl, night: 9 });
  }

  /* --------------------------------------------------------- integration */

  /** Attach the two new screens to the existing menu stack. */
  _registerScreens(game) {
    const menus = game.get('Menus');
    if (!menus || !menus.screens || !menus.wrap) return;
    const add = (key, Screen) => {
      if (menus.screens[key]) return;
      const s = new Screen(menus);
      s.node = document.createElement('div');
      s.node.className = `screen s-${key}`;
      s.node.style.display = 'none';
      menus.wrap.appendChild(s.node);
      s.build(s.node, game);
      menus.screens[key] = s;
    };
    add('shop', ShopScreen);
    add('hunts', HuntBoardScreen);
  }

  /** Everything at Hammerhead you can walk up to and press E at. */
  _registerInteractables(game) {
    const ix = game.get('Interaction');
    if (!ix) { console.warn('[Hammerhead] no InteractionSystem'); return; }
    const A = this.anchors;

    const openShop = (id) => {
      const menus = game.get('Menus');
      const screen = menus?.screens?.shop;
      if (screen && screen.setShop) screen.setShop(id);
      ix.openScreen('shop');
    };

    this._handles.push(ix.register({
      id: 'hh_huntboard', pos: A.huntBoard, radius: 2.9, priority: 2,
      verb: 'Hunts', label: 'Bounty Board', hint: 'Leide Bounty Ledger',
      yOffset: 1.9,
      handler: () => ix.openScreen('hunts'),
    }));

    this._handles.push(ix.register({
      id: 'hh_diner', pos: A.dinerCounter, radius: 2.6, priority: 1,
      verb: 'Shop', label: "The Crow's Nest", hint: 'Provisions & ingredients',
      yOffset: 1.5,
      handler: () => openShop('crowsnest'),
    }));

    this._handles.push(ix.register({
      id: 'hh_garage_shop', pos: A.garageCounter, radius: 2.6, priority: 1,
      verb: 'Shop', label: 'Sophiar Auto Parts', hint: 'Curatives & catalysts',
      yOffset: 1.5,
      handler: () => openShop('garage'),
    }));

    this._handles.push(ix.register({
      id: 'hh_culless', pos: A.culless, radius: 2.8, priority: 1,
      verb: 'Shop', label: 'Culless Munitions', hint: 'Arms & accessories',
      yOffset: 1.5,
      handler: () => openShop('culless'),
    }));

    this._handles.push(ix.register({
      id: 'hh_caravan', pos: A.caravan, radius: 2.8, priority: 1,
      verb: 'Rest', label: 'Caravan', hint: '30 gil · EXP ×1.2',
      yOffset: 1.7,
      handler: () => this._rest(game),
    }));

    this._handles.push(ix.register({
      id: 'hh_pump', pos: A.pump, radius: 2.6, priority: 0,
      verb: 'Refuel', label: 'Fuel Pump', hint: '10 gil a fill',
      yOffset: 1.4,
      handler: () => this._refuel(game),
    }));

    // The Regalia. The prompt used to be pinned to the parking bay and gated on
    // the car being within 8 m of it — but the Regalia parks itself at the
    // roadside site the world already expected one at, hundreds of metres from
    // here, so the gate was never open and the "Drive" prompt never appeared.
    // That is the whole of "how do you get in the car lol".
    //
    // The anchor is now the car's own root, which the vehicle sim writes every
    // frame, so the prompt follows the Regalia wherever it is parked.
    this.anchors.regaliaBay = this.local(4.9, 0, -13.4);
    const car = game.get('Regalia') || game.get('Vehicle');
    const carPos = car?.root?.position || car?.position || this.anchors.regaliaBay;
    this._handles.push(ix.register({
      id: 'hh_regalia_bay', pos: carPos, radius: 3.8, priority: 1,
      verb: 'Drive', label: 'Regalia', hint: 'F to drive  ·  I lets Ignis take the wheel',
      yOffset: 1.3,
      enabled: () => !!(car && car.enabled !== false && !car.isDriving),
      // `enter()` takes an autoDrive flag, not a game: passing `game` here made
      // every walk-up handover the wheel to Ignis.
      handler: () => { if (car && car.enter) car.enter(false); },
    }));

    this._handles.push(ix.register({
      id: 'hh_rentabird', pos: this.local(25.6, 0, 5.0), radius: 2.6, priority: 0,
      verb: 'Read', label: 'Rent-a-Bird', hint: 'Chocobo post',
      yOffset: 1.6,
      handler: () => ix.say({
        speaker: 'Notice', role: 'Rent-a-Bird', hue: 48,
        start: 'a',
        nodes: {
          a: {
            lines: [
              'CLOSED UNTIL FURTHER NOTICE. Birds have been spooked by something '
              + 'out past Longwythe and will not leave the pen.',
              'Underneath, in a different hand: "ask Wiz. he knows what it is."',
            ],
            next: null,
          },
        },
      }),
    }));
  }

  /** Book a night in the caravan through the real day cycle. */
  _rest(game) {
    const ix = game.get('Interaction');
    const rpg = game.get('RpgSystem');
    if (!rpg) return;
    const lodge = rpg.tables?.lodgings?.caravan || { gil: 30, bonus: 0.2 };
    const cost = lodge.gil ?? 30;
    const mult = (1 + (lodge.bonus ?? 0.2)).toFixed(1);

    ix.say({
      speaker: 'Caravan', role: `Hammerhead · ${cost} gil`, hue: 30,
      start: 'offer',
      nodes: {
        offer: {
          lines: () => {
            const banked = Math.round(rpg.expBank?.banked ?? 0);
            const base = `A bunk each and a roof that mostly keeps the dust out. ${cost} gil for the night.`;
            return banked > 0
              ? [base, `You are carrying ${banked.toLocaleString()} EXP nobody has slept on yet. A paid bed cashes it at ×${mult}.`]
              : [base, 'Nothing banked to sleep on, but the sun will still come up somewhere better than here.'];
          },
          next: 'menu',
        },
        menu: {
          choices: [
            {
              label: 'Stay the night', note: `${cost} gil`,
              when: () => (rpg.inventory?.gil ?? 0) >= cost,
              action: () => {
                const r = rpg.restAt('caravan', { wakeHour: 6.5 });
                if (!r || r.ok === false) { this._restFail = r?.reason || 'unknown'; return 'failed'; }
                this._restSummary = r;
                const hud = game.get('HUD');
                if (hud && hud.areaTitle) hud.areaTitle('HAMMERHEAD', 'Leide', 'Dawn · Day ' + r.day);
                return 'slept';
              },
            },
            {
              label: 'Not enough gil', note: `${cost} gil`,
              when: () => (rpg.inventory?.gil ?? 0) < cost,
              next: 'broke',
            },
            { label: 'Not tonight', end: true },
          ],
        },
        slept: {
          lines: () => {
            const r = this._restSummary;
            const lv = (r?.exp?.perMember || []).filter((m) => m.levels && m.levels.length);
            const out = [`You sleep through to ${r?.wokeAt || '06:30'}. Somewhere outside, Cid is already swearing at something.`];
            if (lv.length) {
              out.push(lv.map((m) => `${m.name} reached level ${m.levels[m.levels.length - 1]}`).join('. ') + '.');
            } else if ((r?.exp?.total ?? 0) > 0) {
              out.push(`${Math.round(r.exp.total).toLocaleString()} EXP cashed in. Nobody quite made the next level.`);
            }
            return out;
          },
          next: null,
        },
        broke: { lines: ['Cid does not run a tab. Not for princes either.'], next: null },
        failed: { lines: () => [`The night does not happen. (${this._restFail})`], next: null },
      },
    });
  }

  /** Fill the Regalia's tank. Real gil, real transaction. */
  _refuel(game) {
    const ix = game.get('Interaction');
    const rpg = game.get('RpgSystem');
    const car = game.get('Regalia') || game.get('Vehicle');
    const cost = 10;
    ix.say({
      speaker: 'Fuel Pump', role: 'Hammerhead', hue: 200,
      start: 'a',
      nodes: {
        a: {
          lines: ['The pump chatters, resets, and waits.'],
          next: 'menu',
        },
        menu: {
          choices: [
            {
              label: 'Fill the tank', note: `${cost} gil`,
              when: () => (rpg?.inventory?.gil ?? 0) >= cost,
              action: () => {
                if (!rpg?.inventory?.spendGil(cost)) return 'broke';
                if (car && car.refuel) car.refuel();
                else if (car) car.fuel = 1;
                return 'done';
              },
            },
            { label: 'Leave it', end: true },
          ],
        },
        done: { lines: ['Full tank. The counter rolls over and stops.'], next: null },
        broke: { lines: ['Ten gil. You do not have ten gil.'], next: null },
      },
    });
  }

  /* -------------------------------------------------------------- update */

  /** 0 in full daylight, 1 once the sun is well below the horizon. */
  _night(game) {
    const sky = game.get('Sky');
    if (!sky || !sky.sun || !sky.sun.position) return 0;
    const p = sky.sun.position;
    const elev = p.y / (p.length() || 1);
    return THREE.MathUtils.clamp(1 - (elev + 0.06) * 6.5, 0, 1);
  }

  update(dt, game) {
    if (!this.shell) return;
    const night = this._night(game);
    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    const d = this._camPos.distanceTo(this.origin);

    // Detail LOD: the clutter pass is a hundred small objects that stop being
    // legible well before a hundred metres, and a building's shadow stops
    // earning three cascade draws not much after that.
    const showClutter = d < 95;
    if (this.clutter.visible !== showClutter) this.clutter.visible = showClutter;
    const cast = d < 62;
    if (this._cast !== cast) {
      this._cast = cast;
      for (const m of this._casters) m.castShadow = cast;
    }

    for (const l of this.lights) {
      l.light.intensity = (l.day || 0) + (l.night - (l.day || 0)) * night;
    }
    const M = this.mats;
    if (M) {
      M.lamp.emissiveIntensity = 0.15 + night * 2.4;
      M.warm.emissiveIntensity = 0.44 + night * 1.4;
      M.neon.emissiveIntensity = 0.5 + night * 3.0;
      M.signHH.emissiveIntensity = night * 1.35;
      M.signCN.emissiveIntensity = night * 0.9;
      M.signMB.emissiveIntensity = 0.25 + night * 0.75;
    }
  }
}

/** Scale a geometry's UVs so a tiling material keeps a constant texel size. */
function uvScale(g, su, sv) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

function countTris(group) {
  let n = 0;
  group.traverse((o) => { if (o.isMesh && o.geometry?.index) n += o.geometry.index.count / 3; });
  return n;
}

export default Hammerhead;
