import * as THREE from 'three';
import type { EcoSite } from './props/EcoSites.ts';
import { Ecology } from './veg/Ecology.ts';
import { Rocks } from './props/Rocks.ts';
import { Landmarks } from './props/Landmarks.ts';
import { Debris } from './props/Debris.ts';
import { buildRegalia } from './props/Regalia.ts';
import { Megastructures } from './props/Megastructures.ts';
import { RoadFurniture } from './props/RoadFurniture.ts';
import { Outposts } from './props/Outposts.ts';
import { Wildlife } from './props/Wildlife.ts';
import { PoiKits } from './props/PoiKits.ts';
import { Foraging } from './props/Foraging.ts';
import type { Game } from '../game/Game.ts';
import { bootPhase } from '../engine/BootProfile.ts';
import { loadTexBake } from '../engine/TexBake.ts';
import { loadGeoBake, releaseGeoBake } from '../engine/GeoBake.ts';
import { packSubtree, type PackStats } from '../engine/AttrPack.ts';

/**
 * World dressing: geology, landmarks, scatter debris and the Regalia.
 *
 * Shares the Vegetation system's Ecology sampler so rocks, structures and
 * plants all agree about where the road, the cliffs and the campsite are.
 */
export class Props {
  _camPos!: THREE.Vector3;
  debris!: Debris;
  ecology!: Ecology;
  /** The things lying in the grass. See {@link Foraging}. */
  foraging!: Foraging;
  game!: Game;
  landmarks!: Landmarks;
  mega!: Megastructures;
  outposts!: Outposts;
  poiKits!: PoiKits;
  regalia!: THREE.Group;
  /** Headlamp and tail-lamp materials of the *static* car, for the night ramp. */
  regaliaLamp!: THREE.MeshStandardMaterial;
  regaliaLights!: THREE.SpotLight[];
  regaliaTail!: THREE.MeshStandardMaterial;
  roadKit!: RoadFurniture;
  rocks!: Rocks;
  /**
   * How many entries of `poiKits.built` have been through {@link packSubtree}.
   *
   * `Dungeons.init` packs the *finished boot scene*, which is the only correct
   * place for a whole-scene pass — but 115 of the 139 POI sites are not in it.
   * They stream in one per frame during play and were never re-packed, so every
   * town, haven and outpost the player drives to arrived carrying `3x Float32`
   * colour and normals for the life of the session. `poi_kits` is the largest
   * single owner in `probes/memowners.mts` (85.3 MB of vertex bytes over 3.67 M
   * vertices), so this is where the pass was missing.
   *
   * Packing the site the frame it is built is both the earliest and the
   * cheapest moment: the kit's per-material merges are finished by the time it
   * lands in `built`, and each site is scanned exactly once ever.
   */
  _poiPacked = 0;
  /** Cumulative {@link PackStats} for the streamed sites, for `?debug`. */
  _poiPackStats: PackStats = { seen: 0, packed: 0, refused: 0, saved: 0 };
  wildlife!: Wildlife;
  async init(game: Game) {
    this.game = game;
    const quality = game.rnd && game.rnd.quality === 'low' ? 0.5
      : game.rnd && game.rnd.quality === 'medium' ? 0.75 : 1.0;

    // Props is the first system to touch a keyed material, so it is where the
    // baked texel cache has to be resident. The fetch started at module
    // evaluation, several systems ago, so this normally costs nothing.
    await bootPhase('Props.texbake', () => loadTexBake());
    // Same contract for the geometry bake, and `Water` — third in the boot
    // order — has normally already paid for it. Awaited, never assumed:
    // `project/LANDMINES.md`, "a cache read before `Props.init()` misses on
    // every boot".
    await bootPhase('Props.geobake', () => loadGeoBake());

    const veg = game.get('Vegetation');
    this.ecology = (veg && veg.ecology) || new Ecology(game, game.seed ?? 1337);

    bootPhase('Props.rocks', () => {
      this.rocks = new Rocks(this.ecology, game.scene, { quality });
      this.rocks.build();
    });

    bootPhase('Props.landmarks', () => {
      this.landmarks = new Landmarks(this.ecology, game.scene);
      this.landmarks.build();
    });

    bootPhase('Props.mega', () => {
      this.mega = new Megastructures(this.ecology, game.scene);
      this.mega.build();
    });

    bootPhase('Props.outposts', () => {
      this.outposts = new Outposts(this.ecology, game.scene);
      this.outposts.build();
    });

    bootPhase('Props.roadKit', () => {
      this.roadKit = new RoadFurniture(this.ecology, game.scene);
      this.roadKit.build();
    });

    bootPhase('Props.wildlife', () => {
      this.wildlife = new Wildlife(this.ecology, game.scene, { quality });
      this.wildlife.build();
    });

    // After `rocks`/`ecology` and before the POI kits: it borrows the same
    // sampler and registers nothing until the player is standing next to one.
    bootPhase('Props.foraging', () => {
      this.foraging = new Foraging(this.ecology, game.scene);
      this.foraging.stream.flush({ x: 0, z: 0 });
    });

    bootPhase('Props.debris', () => {
      this.debris = new Debris(this.ecology, game.scene, { quality });
      this.debris.build();
    });

    // Built form at every point of interest on the map. Streams itself in
    // around the camera, so this call only enumerates the sites.
    bootPhase('Props.poiKits', () => {
      this.poiKits = new PoiKits(this.ecology, game.scene, { quality });
      this.poiKits.build();
    });
    // The eight kits that cannot be built inside a frame — see
    // `PoiKits.prebuildHeavy`. Its own boot phase, because half a second is
    // worth seeing in `bootprof` rather than hiding inside `Props.poiKits`.
    bootPhase('Props.poiPrebuild', () => this.poiKits.prebuildHeavy(game));

    bootPhase('Props.regalia', () => this._buildRegalia(game));
    /*
     * The last consumer on the boot path, so the container goes here.
     *
     * It is 165 MB inflated. Every entry a boot asks for has been taken by now
     * and the index drops itself when it empties — but a kit whose site was
     * excluded by a neighbour, or a quality tier that did not match, leaves an
     * entry behind, and one entry is enough to hold the whole body alive for
     * the session. In a process that is already 1.9 GB that is not a rounding
     * error.
     *
     * It also means the 116 POI sites that stream in later do NOT get served
     * from the cache. That is the trade: keeping them would keep all 165 MB
     * resident forever to save work that is already spread over frames.
     */
    releaseGeoBake();
    this._camPos = new THREE.Vector3();
  }

  /**
   * A tiny PMREM sky so chrome and black lacquer have something to reflect
   * even before the Sky system publishes a real environment.
   */
  _fallbackEnv(game: Game) {
    if (game.scene.environment) return null;
    const W = 64, H = 32;
    const data = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      // v=0 is up in equirect layout
      const up = 1 - v;
      const sky = [0.22 + up * 0.28, 0.35 + up * 0.34, 0.62 + up * 0.36];
      const ground = [0.19, 0.16, 0.13];
      const k = THREE.MathUtils.smoothstep(up, 0.44, 0.56);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        data[i] = ground[0] + (sky[0] - ground[0]) * k;
        data[i + 1] = ground[1] + (sky[1] - ground[1]) * k;
        data[i + 2] = ground[2] + (sky[2] - ground[2]) * k;
        data[i + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(game.renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  }

  _buildRegalia(game: Game) {
    const eco = this.ecology;
    const site = eco.sites.find((s: EcoSite) => s.type === 'regalia');
    if (!site) return;
    const env = this._fallbackEnv(game);
    const { group, lights, lamp, tail } = buildRegalia({ envMap: env });
    this.regaliaLights = lights;
    this.regaliaLamp = lamp;
    this.regaliaTail = tail;

    const yaw = site.yaw || 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const yF = eco.height(site.x + fx * 1.75, site.z + fz * 1.75);
    const yR = eco.height(site.x - fx * 1.75, site.z - fz * 1.75);
    const yL = eco.height(site.x + fz * 0.82, site.z - fx * 0.82);
    const yRt = eco.height(site.x - fz * 0.82, site.z + fx * 0.82);

    const outer = new THREE.Group();
    outer.position.set(site.x, (yF + yR + yL + yRt) * 0.25 + 0.015, site.z);
    outer.rotation.y = yaw;
    const inner = new THREE.Group();
    inner.rotation.z = Math.atan2(yF - yR, 3.5);
    inner.rotation.x = Math.atan2(yRt - yL, 1.64);
    inner.add(group);
    outer.add(inner);
    outer.name = 'regalia_root';
    game.scene.add(outer);
    this.regalia = outer;
  }

  /** 0 in full daylight, 1 once the sun is well below the horizon. */
  _night(game: Game) {
    const sky = game.get('Sky');
    if (!sky || !sky.sun || !sky.sun.position) return 0;
    const p = sky.sun.position;
    const elev = p.y / (p.length() || 1);
    return THREE.MathUtils.clamp(1 - (elev + 0.06) * 6.5, 0, 1);
  }

  /**
   * Finish every streamed prop layer where the camera is standing *now*.
   *
   * `Game.settle` calls this on any system that has it, one frame after
   * `applyShot`, i.e. with the shot's camera in place — the same contract
   * `Vegetation.converge` runs under. It exists so that no capture depends on
   * a streaming budget: with it, {@link TileStream.budgetMs} may be tightened
   * for live play without a posed frame moving a pixel, and without a
   * wall-clock budget making a capture depend on how fast the machine was.
   *
   * It is deliberately *not* a visual change: at the shipped cell budgets a
   * 30-frame settle already drained every backlog (12 cells x 30 frames
   * against a ~145-cell disc), which is why the corpus is byte-stable across
   * this commit. It is the guarantee that matters, not the fill.
   */
  converge() {
    const p = this._camPos;
    if (this.rocks) {
      if (this.rocks.stream) this.rocks.stream.flush(p);
      if (this.rocks.outcrops) this.rocks.outcrops.flush(p);
      this.rocks.update(p);
    }
    if (this.debris) { this.debris.stream.flush(p); this.debris.update(p); }
    if (this.foraging) this.foraging.converge(p);
    if (this.wildlife) {
      for (const g of [this.wildlife.birds, this.wildlife.herd, this.wildlife.waders]) {
        if (g && g.stream) g.stream.flush(p);
      }
    }
  }

  update(dt: number, game: Game) {
    const t = game.time.now;
    const night = this._night(game);
    if (this.landmarks) this.landmarks.update(dt, t, night);
    if (this.mega) this.mega.update(dt, t, night);

    // headlights come up as the sun goes down
    if (this.regaliaLights) {
      for (const l of this.regaliaLights) l.intensity = 0.4 + night * 9.5;
      if (this.regaliaLamp) this.regaliaLamp.emissiveIntensity = 0.3 + night * 3.2;
      if (this.regaliaTail) this.regaliaTail.emissiveIntensity = 0.25 + night * 1.3;
    }

    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    this.rocks.update(this._camPos);
    this.debris.update(this._camPos);
    if (this.outposts) this.outposts.update(dt, t, night, this._camPos);
    if (this.roadKit) this.roadKit.update(this._camPos);
    if (this.wildlife) this.wildlife.update(dt, t, night, this._camPos);
    if (this.poiKits) {
      this.poiKits.update(dt, t, night, this._camPos, game);
      // At most one site is built per frame, so this loop runs at most once.
      while (this._poiPacked < this.poiKits.built.length) {
        packSubtree(this.poiKits.built[this._poiPacked++].group, this._poiPackStats);
      }
    }
    if (this.foraging) this.foraging.update(dt, game);
  }
}
