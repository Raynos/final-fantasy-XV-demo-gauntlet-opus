import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { Atmosphere } from './sky/Atmosphere.js';
import { Clouds } from './sky/Clouds.js';
import { MaterialPatch } from './sky/MaterialPatch.js';
import { GodRaysPass } from './sky/GodRays.js';
import { SHOTS } from '../game/Shots.js';

const DEG = Math.PI / 180;
const lerp = THREE.MathUtils.lerp;
const smoothstep = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const SUNRISE = 6.0;
const SUNSET = 19.0;
const SUN_MAX_ELEV = 62;
// The moon has to be genuinely *up* at the hour the night shots are taken. A
// moon at 7 degrees is a grazing key: the ground plane gets almost nothing
// while anything facing it blows out, which reads as a broken exposure rather
// than as moonlight.
const MOONRISE = 14.6;
const MOONSET = 26.6;
const MOON_MAX_ELEV = 46;
const MOON_AZ_OFFSET = 70;

/** Weather presets. Values are lerped toward, so transitions are continuous. */
/**
 * Fog is calibrated in *extinction at range*, not in taste units. With
 * `fogHeight` as the scale height and a camera a few tens of metres up, the
 * horizontal integral is very close to `distance * exp(-camY/H)`, so
 *   od(d) ~= (fogDensity * 0.86 + haze) * d
 * `clear` is tuned to ~15% extinction at 1 km and ~55% at 5 km, which is what
 * a dry, high-visibility badland actually looks like. The old numbers were
 * roughly 4x that: they saturated by ~2 km, which is why every distance band
 * collapsed onto the same inscatter colour and golden hour went monochrome.
 */
/**
 * `covLo`/`covHi` are the window the weather map's coverage channel is
 * stretched over before it multiplies `coverage`. The raw map only spans about
 * 0.15..0.60, so a narrow high window gives sparse, well separated banks while
 * a wide low one gives a continuous deck. It is the single most important
 * control on whether heavy weather has *holes* in it: the old fixed bias could
 * not reach zero, so above ~0.6 coverage the sky became one opaque lid.
 *
 * `tower` is how hard coverage drives cloud *type*, i.e. how much the tall
 * cumulus profile is reserved for the strong parts of the field. It is what
 * makes a storm read as towers standing out of a low ragged base.
 */
const WEATHER = {
  clear: {
    coverage: 0.80, density: 0.021, type: 0.90, detail: 0.30, anvil: 0.30,
    covLo: 0.44, covHi: 0.82, tower: 0.55, baseLift: 0.0, baseSag: 0.10, cloudHaze: 0.0000290,
    virga: 0.0, silver: 0.06, baseShade: 0.55,
    bottom: 1500, top: 4200, cirrus: 0.22, cloudShadow: 0.78,
    fogDensity: 0.00013, fogHeight: 200, haze: 0.00004, sunMul: 1.0,
    exposureMul: 1.0, godRays: 1.0, ambient: 1.0, wind: 7.5,
    overcast: 0.0, skyDim: 1.0, shadowScale: 3.5,
  },
  overcast: {
    // A stratiform lid, but stretched over a *wide* window so the deck keeps
    // internal variation — thin luminous patches and heavier ribs — instead of
    // being one grey dome.
    coverage: 1.0, density: 0.020, type: 0.26, detail: 0.46, anvil: 0.1,
    covLo: 0.10, covHi: 0.66, tower: 0.35, baseLift: 0.55, baseSag: 0.18, cloudHaze: 0.0000120,
    virga: 0.0, silver: 0.07, baseShade: 0.80,
    bottom: 1100, top: 3200, cirrus: 0.10, cloudShadow: 0.35,
    fogDensity: 0.00055, fogHeight: 260, haze: 0.00020, sunMul: 0.30,
    exposureMul: 1.02, godRays: 0.25, ambient: 1.2, wind: 12.0,
    overcast: 0.80, skyDim: 0.60, shadowScale: 5.0,
  },
  storm: {
    // Coverage deliberately short of a lid: the drama is in the gaps. `covLo`
    // stays above zero so the weakest columns are genuinely empty and there is
    // somewhere near the horizon for a break of light to come through, while
    // `tower` reserves the tall cumulonimbus profile for the strong cells.
    coverage: 1.0, density: 0.030, type: 0.52, detail: 0.62, anvil: 0.70,
    covLo: 0.14, covHi: 0.62, tower: 0.75, baseLift: 0.34, baseSag: 0.20, cloudHaze: 0.0000105,
    virga: 0.55, silver: 0.16, baseShade: 0.95,
    bottom: 900, top: 6800, cirrus: 0.0, cloudShadow: 0.88, shadowScale: 7.0,
    fogDensity: 0.00072, fogHeight: 320, haze: 0.00022, sunMul: 0.12,
    // A storm is *dark*. Printing it up a stop is what turned it into an empty
    // grey field; the drama comes from value range, not from lifting the floor.
    exposureMul: 0.94, godRays: 0.40, ambient: 1.30, wind: 30.0,
    // `overcast`/`skyDim` are authored, not derived from coverage: a storm
    // needs its cloud field to have *gaps* (so the deck has silhouette and
    // there is somewhere for a break of light) while the light on the ground
    // stays as heavy as a solid lid. Deriving one from the other forced those
    // two to move together and produced an even grey field.
    overcast: 0.86, skyDim: 0.42,
  },
  fog: {
    coverage: 0.85, density: 0.016, type: 0.45, detail: 0.42, anvil: 0.2,
    covLo: 0.28, covHi: 0.68, tower: 0.45, baseLift: 0.18, baseSag: 0.12, cloudHaze: 0.0000180,
    virga: 0.0, silver: 0.09, baseShade: 0.60,
    bottom: 1300, top: 3600, cirrus: 0.22, cloudShadow: 0.30,
    fogDensity: 0.0060, fogHeight: 70, haze: 0.00075, sunMul: 0.55,
    exposureMul: 1.06, godRays: 0.8, ambient: 1.2, wind: 9.0,
    overcast: 0.35, skyDim: 0.78, shadowScale: 3.5,
  },
};

/**
 * Atmosphere, lighting and weather sky.
 *
 * Owns: physically based scattering sky (LUT driven), sun + moon key light with
 * cascaded shadow maps, volumetric clouds and their ground shadows, cirrus,
 * starfield / milky way / moon, aerial perspective injected into every lit
 * material, image based lighting, god rays and exposure.
 *
 * Public API used by the rest of the game:
 *   setTimeOfDay(hours)  setWeather(name)  sun  moon  cloudShadowTexture
 */
export class Sky {
  constructor() {
    this.hours = 12;
    this.weather = 'clear';
    this.params = Object.assign({}, WEATHER.clear);
    this.target = Object.assign({}, WEATHER.clear);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this._windOffset = new THREE.Vector2();
    this._lastPreFrame = -1;
    this.exposure = 1.0;
    this.exposureCeiling = 12.0;
    this._envHours = -999;
    this._scanCountdown = 0;
  }

  /** @param {import('../game/Game.js').Game} game */
  async init(game) {
    this.game = game;
    const scene = game.scene;
    const renderer = game.renderer;

    // PCFSoftShadowMap is deprecated in three 0.185 and blurs the cascades to
    // mush; PCF with a tight normal bias is sharper and cheaper.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.enabled = true;
    scene.background = null;
    scene.fog = null;            // aerial perspective replaces flat fog

    this.u = this._makeUniforms();

    this.atmo = new Atmosphere(renderer);
    this.u.uSkyLut.value = this.atmo.skyViewRT.texture;
    this.u.uTransLut.value = this.atmo.transmittanceRT.texture;

    this.clouds = new Clouds(renderer, this.u);
    this.u.uCloudTex.value = this.clouds.texture;
    this.u.uCloudShadowMap.value = this.clouds.shadowTexture;

    this.dome = this.atmo.createDome(this.u);
    scene.add(this.dome);

    // --- key light (sun by day, moon by night) via cascaded shadow maps ----
    //
    // Three cascades used to re-render the entire world — clipmap, ~400 props,
    // instanced vegetation, the whole cast — into three 2048² maps, every
    // frame, plus a second time for the water reflection. That was the single
    // biggest cost in the frame. Three things fix it without a visible change:
    // the outer cascades drop to half resolution (they cover ten times the
    // ground, and are faded and softened anyway), they refresh on a stride
    // rather than every frame, and the maps are no longer rebuilt for
    // secondary render passes.
    const tier = (game.rnd && game.rnd.quality) || 'high';
    const res = tier === 'low' ? 1024 : tier === 'medium' ? 1536 : 2048;
    this.cascadeRes = [res, res / 2, res / 2];
    // frames between refreshes: near cascade every frame, mid every other,
    // far every fourth. At sprint speed the far cascade drifts 0.7 m across
    // four frames inside a 200 m box — invisible.
    this.cascadeStride = tier === 'low' ? [1, 4, 8] : [1, 2, 4];

    this.csm = new CSM({
      camera: game.camera,
      parent: scene,
      cascades: 3,
      // 260 m put the far cascade's texels on ground that aerial perspective
      // has already washed out; 190 m keeps every shadow the eye can resolve.
      maxFar: 190,
      mode: 'practical',
      shadowMapSize: res,
      shadowBias: -0.00018,
      lightIntensity: 3.0,
      lightNear: 1,
      lightFar: 1400,
      lightMargin: 150,
      lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
    });
    this.csm.fade = true;
    const normalBias = [0.022, 0.05, 0.12];
    this.csm.lights.forEach((l, i) => {
      l.shadow.normalBias = normalBias[i];
      l.shadow.bias = -0.00018;
      l.shadow.mapSize.setScalar(this.cascadeRes[i]);
      // We drive the refresh ourselves. This also stops three from re-rendering
      // every cascade for the water reflection and the VFX depth prepass,
      // which it does on every top-level render() call.
      l.shadow.autoUpdate = false;
      l.shadow.needsUpdate = true;
    });
    this._lightPos = this.csm.lights.map(() => new THREE.Vector3());
    this._lightTgt = this.csm.lights.map(() => new THREE.Vector3());
    this._camFov = 0;
    this._camAspect = 0;

    /** Reference light for other systems (direction / colour / intensity).
     *  Not added to the scene: the CSM cascade lights do the actual lighting. */
    this.sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
    this.moon = new THREE.DirectionalLight(0xb9cdf5, 0.0);

    this.ambient = new THREE.HemisphereLight(0x9fc0ee, 0x4a4636, 0.18);
    scene.add(this.ambient);

    this.patch = new MaterialPatch(this.csm, this.u);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(this.atmo.envMesh);

    this.godRays = new GodRaysPass(1600, 900);

    // the cloud march and cascade fit need the *current* camera, which is only
    // final once the camera rig has run; scene.onBeforeRender gives us exactly
    // that, one step before the render list is built.
    const prevHook = scene.onBeforeRender;
    scene.onBeforeRender = (r, sc, cam, rt) => {
      if (prevHook) prevHook.call(scene, r, sc, cam, rt);
      this._preRender(r, cam);
    };

    this.setTimeOfDay(12.0);
    this.patch.scan(scene);
  }

  _makeUniforms() {
    return {
      uSkyLut: { value: null },
      uTransLut: { value: null },
      uCloudTex: { value: null },
      uCloudShadowMap: { value: null },
      uCloudBase: { value: null },
      uCloudDetail: { value: null },
      uCloudWeather: { value: null },

      uResolution: { value: new THREE.Vector2(1600, 900) },
      uCloudMode: { value: 1 },
      uPixelAngle: { value: 0.001 },
      uTime: { value: 0 },
      uCamAlt: { value: 20 },

      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunTint: { value: new THREE.Vector3(1, 1, 1) },
      uSunIntensity: { value: 8.5 },
      uSunAngRadius: { value: 0.0075 },
      uSunDiscBrightness: { value: 10 },

      uMoonAngRadius: { value: 0.031 },
      uMoonPhase: { value: 0.72 },
      uMoonBright: { value: 0.5 },
      uMoonTint: { value: new THREE.Vector3(1.0, 0.99, 0.94) },
      uMoonLight: { value: 0 },

      uNight: { value: 0 },
      uStarBright: { value: 1 },
      uMilkyWay: { value: 1 },
      uSkyDim: { value: 1 },
      uOvercast: { value: 0 },
      uStarRot: { value: new THREE.Matrix3() },
      uNightTint: { value: new THREE.Vector3(0.0012, 0.0022, 0.0055) },

      uCirrus: { value: 0.4 },
      uCirrusHeight: { value: 7600 },
      uWindOffset: { value: new THREE.Vector2() },

      uCloudBottom: { value: 1500 },
      uCloudTop: { value: 4200 },
      uCloudCoverage: { value: 0.44 },
      uCloudDensity: { value: 0.016 },
      uCloudDetailAmt: { value: 0.42 },
      uCloudType: { value: 0.86 },
      uCloudBaseTile: { value: 9000 },
      uCloudVertTile: { value: 3600 },
      uCloudDetailTile: { value: 900 },
      uWeatherTile: { value: 27000 },
      uCloudWind: { value: new THREE.Vector2() },
      uAnvil: { value: 0.25 },
      uEnvCloudGain: { value: 0.075 },
      // window the weather map's coverage channel is stretched over — this is
      // what decides whether a heavy deck still has holes in it
      uCloudHaze: { value: 0.0000085 },
      uCovRange: { value: new THREE.Vector2(0.30, 0.62) },
      uTowerAmt: { value: 0.5 },
      uBaseLift: { value: 0 },
      uBaseSag: { value: 0.10 },
      uVirga: { value: 0 },
      uVirgaFloor: { value: 260 },

      uShadowTile: { value: 2700 },
      uShadowFieldScale: { value: 30.0 },
      uCloudShadowStrength: { value: 0.62 },
      uShadowStrength: { value: 0.38 },

      uFogDensity: { value: 0.0011 },
      uFogHeight: { value: 130 },
      uFogBase: { value: -10 },
      uHazeBase: { value: 0.00045 },
      uAerialTint: { value: new THREE.Vector3(1, 1, 1) },
      uAerialStrength: { value: 1.0 },
      uSpecIBL: { value: 0.30 },
    };
  }

  // ------------------------------------------------------------------ API

  /**
   * Drive the whole lighting rig from a clock hour.
   * @param {number} hours 0..24
   */
  setTimeOfDay(hours) {
    this.hours = ((hours % 24) + 24) % 24;
    this._applyTimeOfDay(true);
  }

  /**
   * @param {'clear'|'storm'|'fog'|'overcast'} name
   */
  setWeather(name) {
    const preset = WEATHER[name];
    if (!preset) return;
    this.weather = name;
    this.target = Object.assign({}, preset);
    this._weatherExternal = true;
  }

  /** Tiling ground-level cloud shadow transmittance (r channel). */
  get cloudShadowTexture() { return this.clouds ? this.clouds.shadowTexture : null; }

  /** World size in metres that {@link cloudShadowTexture} tiles over. */
  get cloudShadowTile() { return this.u.uShadowTile.value; }

  // -------------------------------------------------------------- internals

  _sunAngles(h) {
    let elev, az;
    if (h >= SUNRISE && h <= SUNSET) {
      const f = (h - SUNRISE) / (SUNSET - SUNRISE);
      elev = SUN_MAX_ELEV * Math.sin(Math.PI * f);
      az = 90 + 180 * f;
    } else {
      const nh = h < SUNRISE ? h + 24 : h;
      const f = (nh - SUNSET) / (24 - (SUNSET - SUNRISE));
      elev = -55 * Math.sin(Math.PI * f);
      az = 270 + 180 * f;
    }
    return { elev, az };
  }

  _moonAngles(h) {
    const nh = h < MOONRISE ? h + 24 : h;
    const f = (nh - MOONRISE) / (MOONSET - MOONRISE);
    const elev = f <= 1 ? MOON_MAX_ELEV * Math.sin(Math.PI * f) : -25;
    const az = 90 + 180 * Math.min(f, 1) + MOON_AZ_OFFSET;
    return { elev, az };
  }

  static dirFrom(elevDeg, azDeg, out) {
    const e = elevDeg * DEG, a = azDeg * DEG;
    return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
  }

  /**
   * Transmittance of the whole atmosphere along a ray leaving the ground at
   * the given elevation. This is what reddens the sun near the horizon; the
   * light colour is not hand authored.
   */
  static sunTransmittance(sinElev) {
    const Rg = 6360e3, Rt = 6460e3;
    const bR = [5.802e-6, 13.558e-6, 33.1e-6];
    const bM = 4.44e-6;
    const bO = [0.650e-6, 1.881e-6, 0.085e-6];
    const y = Math.max(sinElev, 0.0);
    const x = Math.sqrt(Math.max(0, 1 - y * y));
    const r0 = Rg + 30;
    // distance to the top of the atmosphere
    const b = r0 * y;
    const t = -b + Math.sqrt(Math.max(0, b * b - (r0 * r0 - Rt * Rt)));
    const N = 48;
    const dt = t / N;
    let odR = 0, odM = 0, odO = 0;
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) * dt;
      const px = x * s, py = r0 + y * s;
      const h = Math.hypot(px, py) - Rg;
      odR += Math.exp(-h / 8000) * dt;
      odM += Math.exp(-h / 1200) * dt;
      odO += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * dt;
    }
    return [
      Math.exp(-(bR[0] * odR + bM * odM + bO[0] * odO)),
      Math.exp(-(bR[1] * odR + bM * odM + bO[1] * odO)),
      Math.exp(-(bR[2] * odR + bM * odM + bO[2] * odO)),
    ];
  }

  _applyTimeOfDay(force) {
    const u = this.u;
    const h = this.hours;
    const p = this.params;

    const s = this._sunAngles(h);
    const m = this._moonAngles(h);
    Sky.dirFrom(s.elev, s.az, this.sunDir);
    Sky.dirFrom(m.elev, m.az, this.moonDir);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);

    const camAlt = this.game ? Math.max(2, this.game.camera.position.y) : 20;
    u.uCamAlt.value = camAlt;

    // sky-view LUT: the only thing it depends on is the sun elevation
    this.atmo.bakeSkyView(this.sunDir.y, camAlt, 0.8);

    // --- light colour straight out of the scattering model -----------------
    const T = Sky.sunTransmittance(this.sunDir.y);
    const lum = 0.2126 * T[0] + 0.7152 * T[1] + 0.0722 * T[2];
    const mx = Math.max(T[0], T[1], T[2], 1e-5);
    const horizonFade = smoothstep(-0.035, 0.02, this.sunDir.y);

    const sunColor = new THREE.Color(T[0] / mx, T[1] / mx, T[2] / mx);
    // Irradiance in the same units the sky LUT is integrated in: the solar
    // constant is 1, so ground irradiance = transmittance * uSunIntensity.
    // Keeping this honest is what makes sunlight dominate the ambient and
    // gives cloud shadows and cast shadows real contrast.
    const sunPower = u.uSunIntensity.value * Math.pow(THREE.MathUtils.clamp(lum, 0, 1), 0.85)
                     * horizonFade * p.sunMul;

    const elevDeg = Math.asin(THREE.MathUtils.clamp(this.sunDir.y, -1, 1)) / DEG;
    const night = 1 - smoothstep(-9, -2.5, elevDeg);
    const day = smoothstep(-1, 9, elevDeg);
    const twilight = smoothstep(-15, -1, elevDeg);
    u.uNight.value = night;

    // --- moon --------------------------------------------------------------
    // A grazing moon is a weak key: sin(7 deg) throws away most of the
    // irradiance before it ever reaches the ground. Two stops of headroom on
    // the moon is what makes the ground plane readable while the *ratio* to
    // the fill stays moonlit rather than floodlit.
    const moonUp = smoothstep(-0.06, 0.10, this.moonDir.y);
    const moonPower = 1.9 * moonUp * night * u.uMoonPhase.value;
    u.uMoonBright.value = 3.4 * moonUp;
    u.uMoonLight.value = 0.30 * moonUp * night;

    this.sun.color.copy(sunColor);
    this.sun.intensity = sunPower;
    this.sun.position.copy(this.sunDir).multiplyScalar(500);
    this.moon.color.setRGB(0.56, 0.71, 1.0);
    this.moon.intensity = moonPower;
    this.moon.position.copy(this.moonDir).multiplyScalar(500);

    // the cascade lights follow whichever body is the key light
    const useMoon = sunPower < moonPower;
    const keyDir = useMoon ? this.moonDir : this.sunDir;
    const keyColor = useMoon ? this.moon.color : sunColor;
    const keyPower = Math.max(sunPower, moonPower);
    const prevDir = this._keyDir || (this._keyDir = new THREE.Vector3());
    this.csm.lightDirection.copy(keyDir).multiplyScalar(-1).normalize();
    // A cascade only gets to keep a stale depth map while the light that made
    // it has not moved. The sun crossing the sky invalidates all of them.
    if (prevDir.dot(this.csm.lightDirection) < 0.99995) {
      for (const l of this.csm.lights) l.shadow.needsUpdate = true;
    }
    prevDir.copy(this.csm.lightDirection);
    for (const l of this.csm.lights) {
      l.color.copy(keyColor);
      l.intensity = keyPower;
    }

    u.uSunTint.value.set(1, 1, 1);
    u.uSunIntensity.value = 8.5;
    // heavy cloud puts the whole lower atmosphere in shade
    const overcast = p.overcast != null ? p.overcast : 0.0;
    u.uSkyDim.value = p.skyDim != null ? p.skyDim : 1.0;
    u.uOvercast.value = overcast;
    // A storm deck is lit almost entirely from above and is very deep, so its
    // underside — the part the camera sees — is far darker than a fair-weather
    // cumulus base. Pulling the march's ambient down under heavy cover is what
    // turns the deck from pale mush into a lid.
    if (this.clouds) {
      this.clouds.marchUniforms.uAmbientBoost.value = lerp(1.15, 0.20, overcast);
      this.clouds.marchUniforms.uCloudSunGain.value = lerp(0.42, 0.24, overcast);
    }

    // --- ambient / IBL -----------------------------------------------------
    // Golden hour: the *only* thing that stops the frame collapsing to one hue
    // is that the fill opposes the key. The image-based probe cannot supply it
    // — it integrates the sunset band and comes out amber — so the hemisphere
    // fill is deliberately driven the other way, coolest and strongest exactly
    // when the sun is lowest. Warm key vs blue fill is the whole look.
    const golden = smoothstep(24, 3, elevDeg) * smoothstep(-7, 1.5, elevDeg);
    const skyTint = new THREE.Color().setRGB(
      lerp(0.10, 0.62, day), lerp(0.14, 0.75, day), lerp(0.34, 1.0, day)
    );
    // push the fill toward a saturated sky blue through the golden band
    skyTint.lerp(new THREE.Color(0.26, 0.45, 0.92), 0.72 * golden);
    this.ambient.color.copy(skyTint);
    // ground bounce stays warm ochre: it is the *only* warm fill and it comes
    // from below, which is what a real sunlit landscape does to a standing figure
    this.ambient.groundColor.setRGB(
      0.16 * day + 0.03 + 0.12 * golden,
      0.14 * day + 0.025 + 0.07 * golden,
      0.11 * day + 0.035 + 0.02 * golden
    );
    // Night needs real sky fill, not just a key. With too little of it the moon
    // becomes a binary light: faces turned to it read as snow and everything
    // else falls to black, which looks like a broken exposure rather than
    // night. Lifting the fill compresses that ratio back to something the eye
    // reads as moonlight.
    // `fillBase` is the physically motivated fill and is what the light meter
    // sees; the golden-hour boost on top of it is an *artistic* fill and is
    // deliberately excluded from the meter, otherwise adding blue shadow light
    // would immediately stop the frame down again and cancel itself out.
    const fillBase = lerp(0.155, 0.16, day) * p.ambient;
    this.ambient.intensity = fillBase + 0.54 * golden * p.ambient;

    // The probe is baked from the sky dome, so at low sun it is a bucket of
    // amber. Dialling it back through the golden band hands that job to the
    // (cool) hemisphere fill instead and keeps shadow chroma alive.
    this._envIntensity = lerp(1.0, 0.30, golden) * lerp(1.0, 0.85, night);
    if (this.game && this.game.scene) this.game.scene.environmentIntensity = this._envIntensity;

    // --- exposure ----------------------------------------------------------
    // Sky owns the *scene* exposure and nothing else. It is derived from the
    // irradiance actually landing on a horizontal surface — key light (sun or
    // moon) plus the sky dome's own fill — rather than hand-authored per hour,
    // so weather that kills the sun automatically opens the stop.
    //
    // The fractional power is the print, not the meter: a photograph is graded
    // *relative* to the scene, so a 30x drop in irradiance from noon to night
    // only opens ~1.3 stops instead of 5. That, plus the ceiling below, is what
    // keeps night genuinely dark and blue.
    //
    // PostFX's auto-exposure is handed this as its centre and may only roam
    // inside a narrow band around it — see Exposure.setSceneExposure. Writing
    // renderer.toneMappingExposure here as well would multiply twice.
    const keyE = Math.max(sunPower * Math.max(this.sunDir.y, 0),
      moonPower * Math.max(this.moonDir.y, 0));
    // uSkyDim is how much of the sky dome survives the cloud deck, so it is
    // also how much of the sky's fill reaches the ground
    const skyE = 6.0 * fillBase * u.uSkyDim.value;
    const sceneE = Math.max(keyE + skyE, 0.02);
    // Golden hour is *printed* up. The eye is adapted to the low sun, not to
    // the average of the frame, and a foreground with no shadow detail at all
    // is a failure rather than a mood; this is the one place the model is
    // overridden on purpose.
    // Golden hour is printed up, and so is night — a night that meters
    // honestly is a black rectangle, and FFXV nights are dark but read.
    const evTrim = (1.0 + 0.28 * golden) * (1.0 + 0.24 * night);
    this.exposure = (1.42 / Math.pow(sceneE, 0.22)) * p.exposureMul * evTrim;
    // FFXV nights are dark. A hard ceiling guarantees eye adaptation can never
    // lift the frame out of the blue no matter how black the scene gets.
    this.exposureCeiling = lerp(12.0, 3.4, night);
    this._publishExposure();

    // --- god rays ----------------------------------------------------------
    // strongest when the sun rakes across the frame
    const lowSun = smoothstep(28, 4, elevDeg) * smoothstep(-1.5, 2.0, elevDeg);
    this._godRayBase = (0.32 + 0.85 * lowSun) * p.godRays * day;
    this.godRays.compositeMaterial.uniforms.uTint.value.setRGB(
      1.0, lerp(0.72, 0.88, day), lerp(0.42, 0.72, day)
    );

    // --- starfield rotation -------------------------------------------------
    const lat = 34 * DEG;
    const axis = new THREE.Vector3(0.35, Math.sin(lat), -Math.cos(lat)).normalize();
    const rot = new THREE.Matrix4().makeRotationAxis(axis, (h / 24) * Math.PI * 2 + 1.7);
    rot.multiply(new THREE.Matrix4().makeRotationX(1.15));
    u.uStarRot.value.setFromMatrix4(rot);

    // --- night sky floor ----------------------------------------------------
    // The night floor is deep navy, not black: real night air glows, and the
    // aerial-perspective term reads the same value, so sky and distant ridges
    // sit on one floor instead of separating into cut-out silhouettes.
    u.uNightTint.value.set(0.0082, 0.0128, 0.0290);
    u.uStarBright.value = 1.7;
    u.uMilkyWay.value = 1.35;

    if (force || Math.abs(this.hours - this._envHours) > 0.08) this._updateEnv();
  }

  /**
   * Hand the scene exposure to PostFX. PostFX is built after every system's
   * init(), so this has to be re-issued once it exists — cheap enough to do
   * every frame from lateUpdate.
   */
  _publishExposure() {
    const post = this.game && this.game.post;
    if (!post || !post.exposure || !post.exposure.setSceneExposure) return;
    post.exposure.setSceneExposure(this.exposure, {
      lo: 0.70, hi: 1.90, ceiling: this.exposureCeiling,
    });
    // Sky is the exposure owner; three's own multiplier stays neutral so a
    // second stop can never sneak in behind PostFX's back.
    this.game.renderer.toneMappingExposure = 1.0;
  }

  /**
   * Choose the colour grade. PostFX's own auto-grade asks a `Weather` system
   * for the current conditions, and that system is free to be a stub — when it
   * is, heavy weather silently prints with the clear-sky grade, which is how a
   * storm ended up graded as a bright afternoon. Sky is the one thing that
   * always knows both the clock and the sky state, so it takes the decision
   * and switches PostFX's own selector off.
   */
  _publishGrade() {
    const post = this.game.post;
    if (!post.setGradeBlend) return;
    post.autoGrade = false;
    const h = this.hours;
    let a, b, t;
    if (h < 4.6) { a = b = 'night'; t = 0; }
    else if (h < 6.6) { a = 'night'; b = 'golden'; t = smoothstep(0, 1, (h - 4.6) / 2.0); }
    else if (h < 8.6) { a = 'golden'; b = 'day'; t = smoothstep(0, 1, (h - 6.6) / 2.0); }
    else if (h < 15.5) { a = b = 'day'; t = 0; }
    else if (h < 18.6) { a = 'day'; b = 'golden'; t = smoothstep(0, 1, (h - 15.5) / 3.1); }
    else if (h < 20.4) { a = 'golden'; b = 'night'; t = smoothstep(0, 1, (h - 18.6) / 1.8); }
    else { a = b = 'night'; t = 0; }

    const heavy = { storm: 0.92, overcast: 0.75, fog: 0.45 }[this.weather];
    if (heavy) post.setGradeBlend(t > 0.5 ? b : a, 'storm', heavy);
    else post.setGradeBlend(a, b, t);
  }

  _updateEnv() {
    if (!this.pmrem) return;
    this._envHours = this.hours;
    const prev = this.envRT;
    // analytic clouds for the probe: cheap and it is blurred to irradiance anyway
    this.envRT = this.pmrem.fromScene(this.envScene, 0.0, 1, 20000);
    this.game.scene.environment = this.envRT.texture;
    this.game.scene.environmentIntensity = this._envIntensity != null ? this._envIntensity : 1.0;
    if (prev) prev.dispose();
  }

  /** Cloud/weather lerp + wind advection. */
  update(dt) {
    // fall back to the shot's declared weather until a Weather system drives us
    if (!this._weatherExternal && this.game && this.game.currentShot !== this._shotSeen) {
      this._shotSeen = this.game.currentShot;
      const w = SHOTS[this._shotSeen] && SHOTS[this._shotSeen].weather;
      if (w && WEATHER[w]) { this.weather = w; this.target = Object.assign({}, WEATHER[w]); }
    }

    const k = 1 - Math.exp(-dt * 6);
    let changed = false;
    for (const key of Object.keys(this.target)) {
      const before = this.params[key];
      this.params[key] = lerp(before, this.target[key], k);
      if (Math.abs(this.params[key] - this.target[key]) > Math.abs(this.target[key]) * 1e-3 + 1e-6) changed = true;
    }
    this._pushWeatherUniforms();

    const wind = this.params.wind || 7.5;
    this._windOffset.x += wind * dt;
    this._windOffset.y += wind * 0.42 * dt;
    this.u.uCloudWind.value.set(this._windOffset.x, this._windOffset.y);
    this.u.uWindOffset.value.copy(this._windOffset);
    this.u.uTime.value = this.game ? this.game.time.now : 0;
    if (changed) this._applyTimeOfDay(false);
  }

  _pushWeatherUniforms() {
    const u = this.u, p = this.params;
    u.uCloudCoverage.value = p.coverage;
    u.uCloudDensity.value = p.density;
    u.uCloudType.value = p.type;
    u.uCloudDetailAmt.value = p.detail;
    u.uAnvil.value = p.anvil;
    u.uCloudBottom.value = p.bottom;
    u.uCloudTop.value = p.top;
    u.uCirrus.value = p.cirrus;
    u.uCloudShadowStrength.value = p.cloudShadow;
    u.uCovRange.value.set(p.covLo, p.covHi);
    u.uTowerAmt.value = p.tower;
    u.uBaseLift.value = p.baseLift;
    u.uBaseSag.value = p.baseSag;
    u.uCloudHaze.value = p.cloudHaze;
    u.uVirga.value = p.virga;
    // shafts stop well above the ground: below that the weather volume's own
    // squall curtains take over, and they are depth-aware
    u.uVirgaFloor.value = Math.min(p.bottom - 100, 320);
    if (this.clouds) {
      this.clouds.marchUniforms.uSilver.value = p.silver;
      this.clouds.marchUniforms.uBaseShade.value = p.baseShade;
    }
    // A storm's drama on the ground is the *patchiness* of the light.
    // Magnifying the shadow field puts several cloud-sized patches inside
    // the few hundred metres a low camera can actually see.
    u.uShadowFieldScale.value = p.shadowScale;
    this._shadowDirty = true;
    u.uFogDensity.value = p.fogDensity;
    u.uFogHeight.value = p.fogHeight;
    u.uHazeBase.value = p.haze;
  }

  lateUpdate() {
    const game = this.game;
    if (!game || !game.post) return;
    this._publishExposure();
    this._publishGrade();
    if (!this._raysInserted) {
      this._raysInserted = true;
      const idx = game.post.composer.passes.indexOf(game.post.bloom);
      game.post.composer.insertPass(this.godRays, idx >= 0 ? idx : 2);
      const size = game.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.godRays.setSize(size.x, size.y);
    }
    this._updateGodRayUniforms();
  }

  _updateGodRayUniforms() {
    const cam = this.game.camera;
    const gr = this.godRays;
    const dir = this.sunDir;
    const p = new THREE.Vector3().copy(cam.position).addScaledVector(dir, 4000).project(cam);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const facing = fwd.dot(dir);

    const sx = p.x * 0.5 + 0.5, sy = p.y * 0.5 + 0.5;
    gr.raysMaterial.uniforms.uSunPos.value.set(sx, sy);

    // fade with how far the sun is outside the frame and how much we face it
    const off = Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5));
    const inFrame = smoothstep(1.25, 0.45, off) * smoothstep(0.05, 0.45, facing);
    gr.compositeMaterial.uniforms.uIntensity.value = (this._godRayBase || 0) * inFrame * 0.55;
    gr.raysMaterial.uniforms.uThreshold.value = 1.1 * (this.exposure > 1.4 ? 0.5 : 1.0);
  }

  /**
   * Re-fit and re-render the cascades on their stride.
   *
   * `CSM.update()` refits every cascade at once, so a cascade we mean to leave
   * alone has its light snapped to a new texel — which would desynchronise the
   * stale depth map from the shadow matrix the shader samples it with. The
   * cheapest correct answer is to let CSM do its pass and then put the skipped
   * cascades' lights back exactly where they were.
   *
   * @param {number} frame
   */
  _updateCascades(frame) {
    const lights = this.csm.lights;
    const stride = this.cascadeStride;

    // A hard cut teleports the cascades' coverage; nothing stale survives it.
    const cam = this.game.camera;
    const prev = this._camAnchor || (this._camAnchor = new THREE.Vector3().copy(cam.position));
    const cut = prev.distanceToSquared(cam.position) > 100 || frame < 2;
    prev.copy(cam.position);

    const due = [];
    for (let i = 0; i < lights.length; i++) {
      // `needsUpdate` set elsewhere — the sun moved, the lens changed — means
      // this cascade has to refit now whatever its stride says.
      due[i] = cut || lights[i].shadow.needsUpdate || (frame % stride[i]) === 0;
      this._lightPos[i].copy(lights[i].position);
      this._lightTgt[i].copy(lights[i].target.position);
    }

    this.csm.update();

    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      l.shadow.needsUpdate = due[i];
      if (!due[i]) {
        l.position.copy(this._lightPos[i]);
        l.target.position.copy(this._lightTgt[i]);
      }
      l.updateMatrixWorld(true);
      l.target.updateMatrixWorld(true);
    }
  }

  /** Runs immediately before the scene render, with the final camera. */
  _preRender(renderer, camera) {
    // The dome rides with whatever camera is drawing it — including the water
    // reflection pass — so this part is unconditional.
    camera.updateMatrixWorld();
    this.dome.position.setFromMatrixPosition(camera.matrixWorld);
    this.dome.updateMatrix();
    this.dome.matrixWorld.copy(this.dome.matrix);

    // Everything below is *view dependent state for the main render*. Water
    // renders the whole scene a second time through a mirrored camera, and it
    // does so before the main pass — so without this guard the cloud raymarch
    // was being run for the reflection: the buffer the sky dome then sampled
    // had been marched along rays pointing *down* through the water plane, and
    // hardly any of them ever entered the cloud layer. That is why heavy
    // weather rendered as an empty gradient with a thin sliver of cloud along
    // the top edge of frame — the only rays whose mirror still pointed at the
    // sky.
    if (camera !== this.game.camera) return;
    const frame = this.game.time.frame;
    if (frame === this._lastPreFrame) return;      // GTAO re-renders the scene
    this._lastPreFrame = frame;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.u.uResolution.value.copy(size);
    this.u.uPixelAngle.value = (camera.fov * DEG) / Math.max(1, size.y);
    this.u.uCamAlt.value = Math.max(2, camera.position.y);

    // cascades
    if (camera.fov !== this._camFov || camera.aspect !== this._camAspect) {
      this._camFov = camera.fov;
      this._camAspect = camera.aspect;
      this.csm.updateFrustums();
      for (const l of this.csm.lights) l.shadow.needsUpdate = true;
    }
    this._updateCascades(frame);

    // clouds
    this.clouds.setSize(size.x, size.y);
    this.clouds.render(camera, frame);
    if ((frame & 3) === 0 || this._shadowDirty !== false) {
      this._shadowDirty = false;
      this.clouds.shadowUniforms.uShadowTile.value = this.u.uShadowTile.value;
      this.clouds.renderShadow();
    }

    // Every frame, not every twelfth. A material that appears between scans is
    // drawn bare first and patched afterwards, so its (expensive) program is
    // compiled twice — two synchronous stalls instead of none. The scan itself
    // is a scene traverse with an early-out per material: tens of microseconds.
    this.patch.scan(this.game.scene);
  }
}
