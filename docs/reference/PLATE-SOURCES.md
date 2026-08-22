# Reference corpus sources

All images live in `docs/reference/plates/`. Every file below was downloaded with
`curl -L -A "Mozilla/5.0" -o docs/reference/plates/<name> <direct image URL>` and
verified with `file` (real JPEG data) and `sips -g pixelWidth -g pixelHeight`
(width >= 1200px; most are native 1920x1080 or larger). Three files sourced
from the Final Fantasy Fandom wiki were served as WebP by the wiki's CDN
despite the `.png`/`.jpg` extension in the URL; they were re-encoded to real
JPEG with `sips -s format jpeg` after download (pixel content unchanged,
verified identical dimensions before/after).

Two source pages were used:

1. **Steam store page** — `https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/`
   (official Square Enix screenshots hosted on Steam's CDN,
   `shared.fastly.steamstatic.com`, full-size `.1920x1080.jpg` variant).
2. **Final Fantasy Fandom wiki** — `https://finalfantasy.fandom.com/` (individual
   `File:` description pages, images hosted on `static.wikia.nocookie.net`,
   fetched via the wiki's public MediaWiki API,
   `https://finalfantasy.fandom.com/api.php?action=query&titles=File:<name>&prop=imageinfo&iiprop=url`,
   after the wiki page itself returned an anti-bot 403).

| Filename | What it shows | Source page | Direct image URL |
|---|---|---|---|
| `duscae-plains-lake-01.jpg` | Regalia Type-F (off-road) parked at a lakeshore in open Duscae-style plains — grass, pine trees, distant mountains, full party of four, a Zu-like creature drinking from the lake, reflections on the water. Midday, clear blue sky. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_027c07e0951b3f6fd829f11b6be425fe86097e0a.1920x1080.jpg |
| `duscae-plains-chocobo-02.jpg` | Party riding chocobos through dense, tall backlit grass in open plains, distant pine tree line, mountain silhouette and a volcanic peak on the horizon, low warm sun behind the subjects. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_e2d5e3c2ae507a798b139efc8b49386cbce7899d.1920x1080.jpg |
| `golden-hour-godrays-01.jpg` | Party of four riding in the Regalia convertible along a mountain road at golden hour, strong sun flare/bloom flooding the right side of frame, haze on distant peaks. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_246a43b1fdf8c140842a38c2f96e788ea77cfd12.1920x1080.jpg |
| `golden-hour-water-02.jpg` | Yacht crossing calm open water at sunset, warm pink/gold sky, volumetric haze around the sun, distant cliffs and rock spires, birds in flight, long specular reflection on the water surface. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_2cee0b4f11449eb6def11d0cc62d3bf1e6a27326.1920x1080.jpg |
| `night-campfire-haven-01.jpg` | Noctis approaching a haven campfire at night: warm-lit stone ring with glowing blue/cyan runic wards on the ground, cool blue moonlit forest and rock in the background, starry sky. Direct warm-vs-cool lighting split. | [File:Haven-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Haven-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/b/b2/Haven-FFXV.png/revision/latest?cb=20161206200931 |
| `combat-warpstrike-plains-01.jpg` | Noctis mid-air performing a warp-strike with shattering blue crystalline weapon-throw VFX, imperial MA soldiers and a downed enemy in an open grass field with trees and rolling hills. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_999e73c2cb361d41451d1a84d85f3ff59aa30110.1920x1080.jpg |
| `combat-warpstrike-hud-02.jpg` | Daytime open-field combat against an Imperial Magitek Swordsman with the full gameplay HUD visible: hit counter, HP bars for all four party members (bottom-right), lock-on/phase bar (bottom-left), minimap and quest banner (top-right). | [File:Cross-Chain-Battle-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Cross-Chain-Battle-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/6/67/Cross-Chain-Battle-FFXV.png/revision/latest?cb=20180608012037 |
| `combat-technique-hud-03.jpg` | Melee clash with an Imperial Spearman showing the on-screen technique/command list (Tactical, Sprint, Lock-on, Roll-dodge, Warp-strike, Jump), enemy name+HP bar, "Joined Party" banner, weapon icon and phase gauge bottom-left. | [File:Imperial Spearmen in battle in FFXV.png](https://finalfantasy.fandom.com/wiki/File:Imperial_Spearmen_in_battle_in_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/1/1c/Imperial_Spearmen_in_battle_in_FFXV.png/revision/latest?cb=20190226111818 |
| `behemoth-boss-01.jpg` | Full party of four (Noctis, Prompto, Gladiolus, Ignis visible) facing a rearing Behemoth-type boss monster among overgrown ruins — the classic Episode Duscae demo boss encounter framing. | [File:The Party Facing Behemoth.png](https://finalfantasy.fandom.com/wiki/File:The_Party_Facing_Behemoth.png) | https://static.wikia.nocookie.net/finalfantasy/images/0/07/The_Party_Facing_Behemoth.png/revision/latest?cb=20150205231819 |
| `hud-combat-full-01.jpg` | Reference HUD shot at dusk: warp-strike damage number + label, party weapon wheel (bottom-left), warp-gauge bar with "MAX"/lock-on prompts, minimap with day-counter and quest marker (top-right), full party HP/MP list with portraits (bottom-right), Noctis HP/MP bars. This is the clearest single-frame reference for exact HUD layout. | [File:Warp-Strike-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Warp-Strike-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/4/40/Warp-Strike-FFXV.png/revision/latest?cb=20170714091225 |
| `main-menu-title-01.jpg` | FFXV title/main menu screen (post-completion "Somnus" variant): painterly Noctis/Lunafreya artwork over a dusk sky, logo, and menu list (New Game+, Load Game, Options, Licenses, Credits). | [File:FFXV-Completed-Title-Screen.png](https://finalfantasy.fandom.com/wiki/File:FFXV-Completed-Title-Screen.png) | https://static.wikia.nocookie.net/finalfantasy/images/a/a0/FFXV-Completed-Title-Screen.png/revision/latest?cb=20170709104257 |
| `camp-cooking-01.jpg` | Ignis at a camp site near a dam, camp chairs (Coleman-branded), lantern, cooking ingredients and wine bottle on the table, warm daylight — party camp/cooking setup. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_b5a3e0bf53ea6dc96127f9ba0d03e2c43cd872cc.1920x1080.jpg |
| `rain-storm-leviathan-01.jpg` | Noctis airborne in a driving rainstorm above Altissia, fighting the Leviathan boss — heavy directional rain streaks, wind-blown spray, dark storm-grey sky. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_b535c6bffcee569e9040dfc5a786b10f006cfb1a.1920x1080.jpg |
| `rain-combat-closeup-02.jpg` | Close-up night rain duel between Noctis and Ardyn, crossed daggers with electric-purple/orange spark VFX, wet stone architecture, visible rain streaks lit by the sparks. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_216ad08da8fc356f06f621e5694e8b691873027b.1920x1080.jpg |
| `water-lake-01.jpg` | Boat's-eye view crossing clear turquoise open water toward a coastline with a smoking volcanic peak and a natural rock arch, two party members visible on deck, clear midday sky. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_c3bc3ff54a74503709c84ffefa68139933853724.1920x1080.jpg |
| `party-roadtrip-galdin-01.jpg` | Regalia driving through a sunlit coastal town (Galdin Quay-style) lined with palm trees, cable-car pylons, faded advertising signage, other period-style traffic. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_a0b73e5c079a92658622b3fa05c5a6c151907baa.1920x1080.jpg |
| `town-daytime-altissia-01.jpg` | Daytime Venice-inspired town square (Altissia-style) with the party walking among NPCs, market stalls, gondola posts, and ornate plaster/stone architecture under a clear blue sky. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_923b1dc7d9f36221e92a2906a899ff308b07ca04.1920x1080.jpg |

## Round-2 expansion — characters, beasts, VFX, menus, weather

Thirty-six plates added to close the four measured gaps in the original 17
(characters at close range, the behemoth boss, combat VFX, and HUD/menu
typography), plus more weather variety. Same acquisition method as above:
`curl -L -A "Mozilla/5.0"`, then `sips -s format jpeg` for the Fandom CDN files
that arrive as WebP regardless of extension, then `sips -g pixelWidth
-g pixelHeight` + `file` to confirm real JPEG data at the stated size. Every
plate here is **≥ 1280 px wide**; the smallest are 1280×720, the largest is
3840×2160. Fandom `File:` URLs were resolved through the public MediaWiki API
(`action=query&prop=imageinfo&iiprop=url|size|mime`) because the HTML pages
return an anti-bot 403; the Steam files come from the store's public
`appdetails` JSON (`https://store.steampowered.com/api/appdetails?appids=637650`).

The build each capture comes from is stated in the description, because it
matters for judging: **"retail"** = the shipped 2016 PS4 game or the 2018
Windows Edition (identical art direction), **"Gamescom 2016"** = a press build
three months pre-release running the final character shaders, **"Episode
Duscae"** = the March 2015 PS4 demo, which is genuinely in-engine and shipped
but predates the final skin/hair shading pass. Nothing older than Episode
Duscae was accepted — the E3 2013 material has a different HUD and a different
lighting model and would mislead a blind A/B.

### a. Character close-ups

| Filename | What it shows | Source page | Direct image URL |
|---|---|---|---|
| `character-noctis-face-01.jpg` | Noctis chest-up against a stone wall in soft, cool, near-shadowless ambient light — the single best neutral reference for skin, black hair strand detail and jacket albedo in the corpus. Gamescom 2016 build. | [File:Noctis Gamescom FFXV.png](https://finalfantasy.fandom.com/wiki/File:Noctis_Gamescom_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/7/78/Noctis_Gamescom_FFXV.png/revision/latest?cb=20160816201044 |
| `character-noctis-lightning-02.jpg` | Noctis chest-up casting Thunder: violet lightning arcs and magenta sparks wrapping his arm, on a black backdrop. Official Square Enix Windows Edition store capture (in-engine, posed against black for marketing). Shows spell-lit skin, rim light on hair, and emissive bloom on a dark field. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_28866a86dfe9753492c7737de7622afdeab31f2f.1920x1080.jpg |
| `character-noctis-rain-03.jpg` | Noctis head-and-shoulders in heavy rain — wet skin, water-darkened hair clumping, and rain streaks lit against a dark rock face. Retail build; the reference plate for the wet-character shading variant. | [File:FFXV-Rain-Effect.png](https://finalfantasy.fandom.com/wiki/File:FFXV-Rain-Effect.png) | https://static.wikia.nocookie.net/finalfantasy/images/0/01/FFXV-Rain-Effect.png/revision/latest?cb=20161223193049 |
| `character-noctis-mastershot-04.jpg` | Official Noctis "master shot": a large real-time face close-up plus two full-body standing views on a flat neutral-grey studio backdrop. Retail model. This is the corpus's only plate where the background is a known flat value, so it is the one usable for proportion measurement and near-albedo sampling. | [File:Noctis-Character-Master-Shot-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Noctis-Character-Master-Shot-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/6/66/Noctis-Character-Master-Shot-FFXV.png/revision/latest?cb=20171207210056 |
| `character-gladiolus-face-01.jpg` | Gladiolus chest-up in warm low evening light, greatsword shouldered — facial scar, stubble, brown hair, and a heavily specular leather jacket. Retail build. Strongest warm-key skin reference. | [File:Gladiolus another scar.jpeg](https://finalfantasy.fandom.com/wiki/File:Gladiolus_another_scar.jpeg) | https://static.wikia.nocookie.net/finalfantasy/images/c/cc/Gladiolus_another_scar.jpeg/revision/latest?cb=20170329025304 |
| `character-gladiolus-sunlit-02.jpg` | Gladiolus standing beside the Regalia in full midday sun: bare tattooed arms, dark ribbed tank top, Ignis seated in the car behind him. Gamescom 2016 build. Direct-sun skin and dark-knit-cloth reference. | [File:Gladio FFXV Gamescom.png](https://finalfantasy.fandom.com/wiki/File:Gladio_FFXV_Gamescom.png) | https://static.wikia.nocookie.net/finalfantasy/images/d/d6/Gladio_FFXV_Gamescom.png/revision/latest?cb=20160816200718 |
| `character-ignis-face-01.jpg` | Ignis face close-up lit almost entirely by a single warm interior/firelight key with a near-black surround — glasses, ash-blond swept hair, strong terminator across the face. Retail build. The corpus's most extreme single-key lighting case. | [File:Ignis-Ebony-Coffee-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Ignis-Ebony-Coffee-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/2/2e/Ignis-Ebony-Coffee-FFXV.png/revision/latest?cb=20170715185023 |
| `character-prompto-daylight-01.jpg` | Prompto mid-shot, arms crossed, in full midday sun at Hammerhead — blond hair, studded black leather vest, fingerless gloves, wristband; a second NPC and the garage behind him. Gamescom 2016 build. Blond-hair-in-sun and black-leather-in-sun reference. | [File:Prompto FFXV Gamescom.png](https://finalfantasy.fandom.com/wiki/File:Prompto_FFXV_Gamescom.png) | https://static.wikia.nocookie.net/finalfantasy/images/7/7c/Prompto_FFXV_Gamescom.png/revision/latest?cb=20160816201348 |
| `party-four-casual-01.jpg` | All four party members three-quarter-length in casual outfits (grey henley, white tee + cap, red tank, black tank) in bright coastal daylight. Retail build. The only plate with saturated *and* white *and* black cloth in the same lighting — the corpus's albedo calibration chart. | [File:Party Custom Outfits FFXV.png](https://finalfantasy.fandom.com/wiki/File:Party_Custom_Outfits_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/c/ca/Party_Custom_Outfits_FFXV.png/revision/latest?cb=20160816201347 |
| `party-three-field-02.jpg` | Four party members standing full-body, well separated, in an open scrub field under flat overcast light, camera high and pulled back. Gamescom 2016 build. Silhouette / head-to-body / gameplay-distance-legibility reference. | [File:Party in a Field FFXV .png](https://finalfantasy.fandom.com/wiki/File:Party_in_a_Field_FFXV_.png) | https://static.wikia.nocookie.net/finalfantasy/images/9/91/Party_in_a_Field_FFXV_.png/revision/latest?cb=20160816201347 |

### b. Behemoth / large beasts

| Filename | What it shows | Source page | Direct image URL |
|---|---|---|---|
| `behemoth-deadeye-duscae-02.jpg` | **Deadeye** — the Episode Duscae behemoth — standing in the Duscae grassland at mid-distance with Noctis in the foreground for scale and the combat HUD live. March 2015 PS4 demo build. This is the boss our build is measured against, so it is the single most important beast plate. | [File:Behemoth-Episode-Duscae.jpg](https://finalfantasy.fandom.com/wiki/File:Behemoth-Episode-Duscae.jpg) | https://static.wikia.nocookie.net/finalfantasy/images/b/b6/Behemoth-Episode-Duscae.jpg/revision/latest?cb=20150216234548 |
| `behemoth-dread-skyline-03.jpg` | Dread Behemoth on a clifftop at Cape Caem, read as a near-pure black silhouette against open blue sky and pale limestone, with the Timed Quest HUD. Retail build. The reference for "how a boss reads against the sky". | [File:Dread Behemoth at Cape Caem Timed Quest in FFXV.png](https://finalfantasy.fandom.com/wiki/File:Dread_Behemoth_at_Cape_Caem_Timed_Quest_in_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/a/ad/Dread_Behemoth_at_Cape_Caem_Timed_Quest_in_FFXV.png/revision/latest?cb=20190915172627 |
| `behemoth-dread-snow-04.jpg` | Dread Behemoth mid ice-attack in a whiteout blizzard — dark beast against an almost featureless white sky, full boss HUD (name plate, enemy HP, party stack). Retail build. Inverted-contrast counterpart to plate 03. | [File:Dread Behemoth ice attack from FFXV.png](https://finalfantasy.fandom.com/wiki/File:Dread_Behemoth_ice_attack_from_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/6/61/Dread_Behemoth_ice_attack_from_FFXV.png/revision/latest?cb=20181010014016 |
| `behemoth-kaiser-snow-05.jpg` | Kaiser Behemoth close-range in snow: white mane, huge curved horns, open jaw, in bright overcast snowfield light with the Episode Prompto HUD. Retail (Episode Prompto DLC). The corpus's best *light-coloured* fur reference. | [File:Kaiser Behemoth in FFXV Episode Prompto.jpg](https://finalfantasy.fandom.com/wiki/File:Kaiser_Behemoth_in_FFXV_Episode_Prompto.jpg) | https://static.wikia.nocookie.net/finalfantasy/images/a/ad/Kaiser_Behemoth_in_FFXV_Episode_Prompto.jpg/revision/latest?cb=20190626185120 |
| `behemoth-roar-closeup-06.jpg` | Behemoth head filling the frame mid-roar — fangs, gums, wrinkled muzzle skin, mane fur, with Gladiolus's head in profile at the frame edge for scale. Episode Duscae era. Closest fur/hide detail in the corpus. | [File:Final Fantasy XV Behemoth and Gladiolus.jpg](https://finalfantasy.fandom.com/wiki/File:Final_Fantasy_XV_Behemoth_and_Gladiolus.jpg) | https://static.wikia.nocookie.net/finalfantasy/images/c/cf/Final_Fantasy_XV_Behemoth_and_Gladiolus.jpg/revision/latest?cb=20150223043647 |
| `beast-adamantoise-sky-01.jpg` | The Adamantoise — a mountain-sized turtle — head and shell breaking a hazy horizon, with sun flare over the shell edge. Retail build. Extreme-scale silhouette and aerial-perspective-on-a-creature reference. | [File:Adamantoise in FFXV.png](https://finalfantasy.fandom.com/wiki/File:Adamantoise_in_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/a/a3/Adamantoise_in_FFXV.png/revision/latest?cb=20180827004924 |
| `beast-zu-sky-02.jpg` | A Zu in flight isolated against clean blue sky and one cloud — nothing else in frame. Retail build. The cleanest possible "creature vs. sky" contrast measurement in the corpus. | [File:Zu flying from FFXV.png](https://finalfantasy.fandom.com/wiki/File:Zu_flying_from_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/5/51/Zu_flying_from_FFXV.png/revision/latest?cb=20180728011700 |
| `beast-party-plains-03.jpg` | A large crimson daemon-beast (bone crest, chitinous flesh spines, quadrupedal) fought by a spread-out hunting party in open flowering grassland with dead trees and a mountain backdrop. Windows Edition / Comrades content — same engine, shaders and grade as the single-player retail build. Multi-character-vs-boss staging reference. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_a1fcc0d974bfc660bf3f48a3687b8a9f10336da3.1920x1080.jpg |

### c. Combat VFX

| Filename | What it shows | Source page | Direct image URL |
|---|---|---|---|
| `vfx-linkstrike-ignis-01.jpg` | Noctis + Ignis **link-strike** at the moment of impact: a white-hot core with radiating orange-red spark shards, hit counter ("3 HITS"), floating damage number, both character name tags, full party HUD. Retail build. The definitive link-strike reference. | [File:Link-Strike-Ignis-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Link-Strike-Ignis-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/1/12/Link-Strike-Ignis-FFXV.png/revision/latest?cb=20161213034506 |
| `vfx-linkstrike-gladiolus-02.jpg` | Gladiolus + Noctis link-strike on a goblin-type enemy in daylight scrub — green-white burst, white spark particles, HUD live. Retail build. Second link-strike sample, different pairing and lighting. | [File:Gladiolus-Noctis link-strike from FFXV.png](https://finalfantasy.fandom.com/wiki/File:Gladiolus-Noctis_link-strike_from_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/0/0d/Gladiolus-Noctis_link-strike_from_FFXV.png/revision/latest?cb=20190226105801 |
| `vfx-linkstrike-pose-03.jpg` | Noctis + Ignis in the link-strike wind-up pose against a scorpion-type enemy in bright desert plains, minimap and command list visible. Retail build. Shows the pre-impact staging and camera framing of a link-strike. | [File:Noctis-Ignis link-strike pose from FFXV.png](https://finalfantasy.fandom.com/wiki/File:Noctis-Ignis_link-strike_pose_from_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/5/56/Noctis-Ignis_link-strike_pose_from_FFXV.png/revision/latest?cb=20190226110206 |
| `vfx-warpstrike-road-04.jpg` | Noctis landing a **warp-strike** on a roadside enemy: the cyan-white crystalline shard trail behind him, blade impact flash, damage numbers, party HP stack. Retail build. The clearest single frame of the warp-strike trail shape. | [File:Noctis-Warps-to-an-Enemy-FFXV.jpg](https://finalfantasy.fandom.com/wiki/File:Noctis-Warps-to-an-Enemy-FFXV.jpg) | https://static.wikia.nocookie.net/finalfantasy/images/7/7e/Noctis-Warps-to-an-Enemy-FFXV.jpg/revision/latest?cb=20150126034631 |
| `vfx-warpstrike-burst-05.jpg` | Warp-strike impact burst on a gigantuar: a large volumetric cyan-blue crystalline flare filling most of the frame in bright daylight. Retail build. Shows how far the warp VFX blooms over a *bright* background rather than a dark one. | [File:Noctis warp-strikes a gigantuar from FFXV.png](https://finalfantasy.fandom.com/wiki/File:Noctis_warp-strikes_a_gigantuar_from_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/3/3b/Noctis_warp-strikes_a_gigantuar_from_FFXV.png/revision/latest?cb=20180803012825 |
| `vfx-armiger-field-06.jpg` | Armiger active in an open daylight field — the fan of spectral royal-arm weapons orbiting Noctis, imperial soldiers around him. 2667×1500, the highest-resolution plate in the corpus. Retail build. Weapon-summon reference in daylight. | [File:Noctis-Armiger-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Noctis-Armiger-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/7/7c/Noctis-Armiger-FFXV.png/revision/latest?cb=20180116174144 |
| `vfx-technique-damage-07.jpg` | Gladiolus's Tempest technique mid-swing at night: violet-magenta arc VFX, dust, a lit blue weapon trail, and **three simultaneous floating damage numbers** (3137 / 3469 / 3528) plus the technique name banner and technique gauge. Retail build. The damage-number typography reference. | [File:Tempest-Gladiolus-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Tempest-Gladiolus-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/9/9a/Tempest-Gladiolus-FFXV.png/revision/latest?cb=20170405173334 |
| `vfx-armiger-night-08.jpg` | Armiger Unleashed at a lakeside at night: pale blue-white spectral weapon "wings" spread behind Noctis under a violet magic burst, party members mid-lunge, dark treeline. Official Windows Edition store capture. The corpus's best emissive-VFX-on-dark-background plate. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_6d8326d518c704b1f0590700d5cebed626b23621.1920x1080.jpg |
| `vfx-royalarm-night-09.jpg` | Night fight in a cyan-lit interior: Noctis lunging with a glowing violet royal arm at an armoured enemy wielding a large emissive crystalline axe, three party members converging. Official Windows Edition store capture. Weapon self-illumination and cool-key combat lighting. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_5d84f8bbc15e7fe6699a044a93085d291d458af3.1920x1080.jpg |

### d. HUD / menu screens

| Filename | What it shows | Source page | Direct image URL |
|---|---|---|---|
| `menu-gear-weapon-01.jpg` | The **Gear → weapons** menu at full res: left column of party members, four weapon slots with stat deltas, right-hand scrolling weapon list with rarity glyphs, description panel, live rotating character model on the right, stat bar footer. Retail build, 1844×1028 (console UI scale). The primary menu-typography reference. | [File:Weapon equipment menu in FFXV.png](https://finalfantasy.fandom.com/wiki/File:Weapon_equipment_menu_in_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/a/ab/Weapon_equipment_menu_in_FFXV.png/revision/latest?cb=20190826180052 |
| `menu-gear-accessories-02.jpg` | The same Gear screen on the **accessories** tab — three accessory slots, a long alphabetical item list, and the same live character model and footer. Retail build. Confirms which parts of the layout are fixed chrome and which are tab-dependent. | [File:Accessories equip menu in FFXV.png](https://finalfantasy.fandom.com/wiki/File:Accessories_equip_menu_in_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/6/69/Accessories_equip_menu_in_FFXV.png/revision/latest?cb=20190826180248 |
| `menu-ascension-combat-03.jpg` | The **Ascension** grid, Combat branch, captured at 3840×2160 — the constellation-style node tree with connector lines, locked/unlocked node states, AP counter, tab strip and header blurb. Retail build. The sharpest UI type in the corpus by a wide margin; use it for glyph shapes and stroke weights. | [File:Combat-Ascension-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Combat-Ascension-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/5/55/Combat-Ascension-FFXV.png/revision/latest?cb=20170621190823 |
| `menu-elemancy-04.jpg` | The **Elemancy** spellcrafting menu: circular element-mix dial on the left, ingredient list with counts on the right, resulting-spell preview panel, live character model. Retail build. A third distinct menu archetype (dial + list + preview). | [File:Elemancy menu in FFXV.png](https://finalfantasy.fandom.com/wiki/File:Elemancy_menu_in_FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/d/d2/Elemancy_menu_in_FFXV.png/revision/latest?cb=20190824201032 |

### e. Landscape / weather variety

| Filename | What it shows | Source page | Direct image URL |
|---|---|---|---|
| `duscae-thunderstorm-03.jpg` | Duscae lake under a full thunderstorm: flat leaden overcast, a lightning bolt striking the far shore, heavy haze collapsing the mid-ground, near-monochrome desaturated grade. Retail build. The corpus's only daytime storm-lighting reference. | [File:Duscae-Thunderstorm-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Duscae-Thunderstorm-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/9/9b/Duscae-Thunderstorm-FFXV.png/revision/latest?cb=20170320031609 |
| `duscae-wilderness-04.jpg` | Duscae forest clearing: pine trunks, mossy boulders, mixed sun-and-shade dappling on grass, a lone party member at mid-distance for scale. Retail build. Fills the "wooded interior of the plains biome" gap. | [File:Duscae-Wilderness-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Duscae-Wilderness-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/0/08/Duscae-Wilderness-FFXV.png/revision/latest?cb=20170715185624 |
| `duscae-plains-noon-05.jpg` | Wide Duscae lake basin at clear midday, Noctis small in frame, a Zu circling above the far ridge, full aerial-perspective stack from foreground grass to hazy mountains. Retail build. The reference wide establishing shot of the biome our build renders. | [File:Duscae-Lake-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Duscae-Lake-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/a/a3/Duscae-Lake-FFXV.png/revision/latest?cb=20170321011142 |
| `rain-fog-prompto-03.jpg` | Prompto running through dense cold fog and drizzle beside the Regalia — visibility collapsed to a few metres, subject reduced to a low-contrast silhouette. Retail build. The corpus's fog-density reference. | [File:Prompto-rain-FFXV.png](https://finalfantasy.fandom.com/wiki/File:Prompto-rain-FFXV.png) | https://static.wikia.nocookie.net/finalfantasy/images/1/14/Prompto-rain-FFXV.png/revision/latest?cb=20161219212453 |
| `night-insomnia-party-02.jpg` | The party of four seen from behind at night in ruined Insomnia, lit only by distant tower windows — a heavy green-teal night grade with the four silhouettes rim-lit against city light. Official Windows Edition store capture. Night-exterior grade and silhouette-readability reference. | [Steam store page](https://store.steampowered.com/app/637650/FINAL_FANTASY_XV_WINDOWS_EDITION/) | https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/637650/ss_2bb6ae8061af8d4b53ab21b84a9a2f40b1f8a837.1920x1080.jpg |

## Notes on sourcing

- All Steam screenshots are official Square Enix promotional captures published
  on the FINAL FANTASY XV WINDOWS EDITION Steam store page; they are the PC
  version (higher/uncapped res, same art direction, assets, and lighting model
  as the PS4 Royal Edition — SE did not change the art direction between
  platforms, only resolution/framerate/some texture filtering).
- The Fandom wiki images that show the combat HUD and technique list are
  console-era captures (visible aspect ratio / UI scale matches PS4 Royal
  Edition, not the PC ultrawide-capable UI), which is why they were
  specifically sought out for the HUD-reference requirement — none of the
  official Steam marketing shots retain on-screen HUD elements (they're
  captured HUD-off for cleanliness).
- No image in this corpus is fan art, a render, or AI-generated; every file is
  a genuine in-engine screenshot or title-screen capture from a shipped build
  of Final Fantasy XV.

### Why the round-2 plates are trustworthy as in-engine footage

- **The Fandom captures are player/press screen-grabs of running builds, not
  press renders.** Every one of them retains at least one giveaway that only
  a live frame has: a live HUD element (minimap, party HP stack, technique
  gauge, quest banner, damage numbers, Timed Quest countdown), a console UI
  scale (1844×1032-class capture geometry, i.e. a 1080p console frame with the
  overscan margin trimmed), or a menu screen that cannot exist outside the
  running game. The exceptions are called out explicitly below.
- **Two plates are posed rather than played and are labelled as such:**
  `character-noctis-mastershot-04.jpg` (official real-time "master shot" on a
  flat studio backdrop) and `character-noctis-lightning-02.jpg` (official
  Square Enix Steam-gallery capture on a black backdrop). Both are in-engine
  Luminous renders of the shipped character assets, and both were kept
  specifically because a controlled backdrop is what makes proportion and
  near-albedo measurement possible at all — but neither should be handed to a
  judge as evidence of *gameplay* framing or composition.
- **Build ages were checked and old material was rejected.** Two otherwise
  attractive candidates were downloaded, inspected and then **deleted**:
  a 2013-era behemoth battle frame (E3 2013 build — a completely different HUD
  and lighting model) and a February 2015 party-victory frame (pre-Episode
  Duscae character shaders). Neither would survive a blind A/B as a fair
  representation of the shipped game. Two Episode Duscae (March 2015 PS4 demo)
  plates were kept — `behemoth-deadeye-duscae-02.jpg` and
  `behemoth-roar-closeup-06.jpg` — because Deadeye is the specific boss this
  project is measured against and no retail-build capture of it at comparable
  framing was findable; judge their *creature* detail, not their grade.
- **Resolution floor.** Every round-2 plate is ≥ 1280 px wide and was verified
  with `sips -g pixelWidth -g pixelHeight`. Candidates that failed were dropped
  rather than upscaled: the wiki's official four-view face/character model
  sheets for Noctis, Gladiolus, Ignis and Prompto are only 782 px wide, and the
  Deadeye model render is 856 px, so none of them are in the corpus. This is
  the one gap the expansion did not close — there is no high-resolution
  neutral-lit reference for Gladiolus's, Ignis's or Prompto's *faces* in
  isolation, only for Noctis (`character-noctis-mastershot-04.jpg`).
- **The Steam plates are the same official Square Enix gallery** already
  described above; the round-2 additions were pulled from the store's public
  `appdetails` JSON, which lists all 23 gallery images, and are the same
  `.1920x1080.jpg` variants. Two of the 23 were rejected as marketing banners
  with overlaid review-quote and DLC-promo text rather than screenshots.

## Deadeye encounter structure (round 4 research)

Research-only section. No image was downloaded for it; every row below is a
*design* citation — the structure, mechanics and pacing of the real Deadeye
encounter — gathered so the second act we build is **adapted, not invented**.
Sources were fetched 2026-08-11. Where sources disagree, both numbers are
given; where a claim could not be verified, it is marked **UNVERIFIED** rather
than smoothed over.

Two builds are distinguished throughout, because they differ and our demo is
modelled on the earlier one:

- **ED** = *Final Fantasy XV Episode Duscae*, the PS4/XB1 demo, March 2015
  (2.0 update June 2015). The forest is called **Mistwood** here.
- **Retail** = the shipped 2016 game (and 2018 Windows Edition), where the same
  encounter is the hunt **"A Behemoth Undertaking"** and the forest is renamed
  **Nebulawood**.

### VERDICT on the load-bearing claim

The claim under test was: *"Deadeye is blinded/scared off, flees, the party
tracks it through tall grass, and a flare relights the fight."*

**FALSE as stated.** It contains recognisable fragments of the real encounter
in the wrong order, with the wrong actor, and with an invented device. Piece by
piece:

| Fragment of the claim | Verdict | What actually happens |
|---|---|---|
| Deadeye is **blinded** during the fight | **FALSE** | Deadeye is *already* half-blind before the player ever meets it. It is blind in the **right** eye and missing the **right horn**; the name and the Japanese name スモークアイ ("Smoke Eye") both derive from the pre-existing scar. Nothing in either build blinds it mid-encounter. ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV))) |
| Deadeye **flees** | **FALSE — the actor is reversed** | In ED it is the **party** that flees, after the ambush fails. Deadeye never runs from the player. ([Fandom: Episode Duscae](https://finalfantasy.fandom.com/wiki/Final_Fantasy_XV_Episode_Duscae)) The only Deadeye-side disengage is in retail and is *player*-caused: "If the player moves too far away from its range, it will climb back onto its sleeping spot." ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV))) |
| Party **tracks it through tall grass** | **HALF TRUE, BUT MISPLACED IN THE ORDER** | A tracking/stalking beat is real and is the single most distinctive thing about this encounter — but it is **mist in a rocky wood**, not tall grass, and it happens **before the first blow is struck**, as the approach to the lair. It is not an intermission between two combat acts. ([Fandom: Nebulawood](https://finalfantasy.fandom.com/wiki/Nebulawood)) |
| A **flare relights** the fight | **FALSE as a flare** | The relight-analogue is an **explosive**, not a light source: in ED, Prompto shoots a **gas canister** as Deadeye steps into range; in retail, the player detonates **oil drums** with fire magic. ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV))) |
| It is a **two-act** encounter | **TRUE at quest scale, in ED only — but act 2 is elsewhere** | ED really does structure it as ambush → failure → forced retreat → **a different dungeon** (Fociaugh Cavern) to acquire Ramuh → return and confront it a second time. The intermission is a **cave crawl in another location**, not a stealth beat inside the arena. ([Fandom: Episode Duscae](https://finalfantasy.fandom.com/wiki/Final_Fantasy_XV_Episode_Duscae)) |

**Design consequence:** if we want a stealth/tracking beat, the source puts it
*in front of* the fight as an approach, and if we want a second act, the source
puts it *after a failure* and *in another place*. Building "fight → blind it →
chase it through grass → flare → fight" would be inventing, not adapting.

### Act structure, ED (the build our demo is modelled on)

Order of events, all from the ED story summary and the ED walkthrough:

1. **Bounty.** Party is stranded; locals post **25,000 gil** on a half-blind
   behemoth called Deadeye. The horn sells for the repair money.
   ([Fandom: Episode Duscae](https://finalfantasy.fandom.com/wiki/Final_Fantasy_XV_Episode_Duscae))
2. **Clue hunt (non-combat).** Six markers on the map, each a trail/clue —
   including **footprints in the mud**. Searching all six spawns a new marker
   pointing at Deadeye's location.
   ([samurai-gamers ED walkthrough](https://samurai-gamers.com/final-fantasy-15-ffxv/episode-duscae-walkthrough/),
   [Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))
3. **Stalk (non-combat, the distinctive beat).** The party tails Deadeye
   through the mist of the Mistwood to its lair, keeping out of its line of
   sight. Guidance: "stay at least several steps behind his tail and behind the
   line of sight of either eye, moving from rock to rock and taking cover"; if
   it grows suspicious, back off and zigzag between boulders.
   ([samurai-gamers](https://samurai-gamers.com/final-fantasy-15-ffxv/episode-duscae-walkthrough/))
   A contemporaneous 2015 review describes the same beat: "you have to track him
   through the mist, using his blind eye and rocks for cover."
   ([Geek I/O, 26 Mar 2015](https://www.geek-io.net/gamergeeks/2015/3/26/final-fantasy-xv-episode-duscae-review))
4. **Ambush (act 1 opens).** In the lair Deadeye sleeps on a ledge. Ignis lays
   out a plan: lure it out along its **blind side** and have **Prompto shoot a
   gas canister** as it steps into range. (ED has no usable magic and no
   explosive barrels — the canister is the demo's substitute.)
   ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))
   Execution: walk in at ground level, then point-warp up successive towers as
   it approaches; a **QTE** follows, ended by warping on prompt. "Deadeye will
   appear to fall, but it's all a ruse."
   ([samurai-gamers](https://samurai-gamers.com/final-fantasy-15-ffxv/episode-duscae-walkthrough/))
5. **Act 1 fails.** "My fears proved right when the beast jumped up and
   attacked. We regrouped and fought it for a bit before it proved too much and
   we were forced to flee."
   ([Geek I/O](https://www.geek-io.net/gamergeeks/2015/3/26/final-fantasy-xv-episode-duscae-review))
   The escape route is a "tiny, ground level hole in the wall behind him on the
   right", flagged before the fight starts.
   ([samurai-gamers](https://samurai-gamers.com/final-fantasy-15-ffxv/episode-duscae-walkthrough/))
6. **Intermission — a different dungeon.** The party asks locals for more clues,
   learns of **Fociaugh Cavern**, fights through a goblin horde, and Noctis is
   granted **Ramuh**, summonable only when Noctis is weakened (0 HP).
   ([Fandom: Episode Duscae](https://finalfantasy.fandom.com/wiki/Final_Fantasy_XV_Episode_Duscae))
7. **Act 2.** Re-enter the arena through the same hole. The straight fight is
   described as "a bit tedious" because of the charging and stomping; Ramuh
   ends it in one summon.
   ([samurai-gamers](https://samurai-gamers.com/final-fantasy-15-ffxv/episode-duscae-walkthrough/),
   [Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))
8. **Afterwards** Deadeye respawns on the plains of Duscae and can be fought
   repeatedly. ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))

**UNVERIFIED:** whether ED's first encounter is *hard-scripted* unwinnable. The
wiki phrases it conditionally — "if the player has not acquired Ramuh, the party
wants to flee" — and one 2015 impressions piece states there are two paths, "engage
in prolonged combat by leveling up substantially, or locate a summon", which
implies the first fight is winnable but brutal rather than scripted-lose.
([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)),
[We The Nerdy, 2015](https://wethenerdy.com/final-fantasy-xv-episode-duscae-impressions/))
No source we found settles it. Do not model "unlosable act 1" or "unwinnable
act 1" as fact.

### Act structure, retail ("A Behemoth Undertaking")

The retail version **collapses ED's two acts into one**. There is no failed
ambush, no forced retreat, and no Ramuh detour — the fight is won on the first
confrontation.

1. **Hunt posted** by the tipster at Wiz Chocobo Post; level 15, 2 stars, bounty
   3,020 gil + Amethyst Bracelet. Also gates **chocobo rentals** and the quest
   "Friends of a Feather".
   ([FFXV Wiki: A Behemoth Undertaking](https://finalfantasyxv.fandom.com/wiki/A_Behemoth_Undertaking),
   [Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))
   In-game radio: Deadeye "was sighted laying waste to fields neighboring Wiz
   Chocobo Post late last night, before taking refuge in the nearby Nebulawood."
2. **Approach.** Enter the Nebulawood from the southern entrance, follow a
   straightforward path, clear Voretooths, crawl through a small passage; a
   cutscene reveals the behemoth ahead.
   ([Fandom: Nebulawood](https://finalfantasy.fandom.com/wiki/Nebulawood),
   [GosuNoob](https://www.gosunoob.com/final-fantasy-xv/how-to-kill-behemoth-ffxv/))
3. **Stalk.** "During the misty portion the player must stalk the behemoth
   without being seen, **but without falling too far behind**." Two failure
   modes, not one: "don't let him see you or lose him, because you will have to
   start over again." Getting too close raises a **red bar at the top of the
   screen**, with a chance to break line of sight behind cover and recover.
   It ends when Deadeye **jumps onto some rocks** in the north-east corner of
   the area — i.e. the beat is ended by the *monster*, on reaching its lair, not
   by the player.
   ([Fandom: Nebulawood](https://finalfantasy.fandom.com/wiki/Nebulawood),
   [GosuNoob](https://www.gosunoob.com/final-fantasy-xv/how-to-kill-behemoth-ffxv/),
   [Gamer Guides: Wiz Chocobo Hunts](https://www.gamerguides.com/final-fantasy-xv/guide/optional-content/hunts/wiz-chocobo-hunts))
   A later patch added an **opt-out**: let Deadeye spot you and the game offers
   to skip the sequence with no penalty — i.e. Square Enix themselves treated
   the stealth beat as optional friction.
   ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))
4. **Fight**, in the ruins of an old Lucian armory where "live explosives still
   line the walls". Deadeye descends from its sleeping perch next to an oil
   drum. Ignis prompts the player to use fire magic on the drums; a fire deposit
   sits just before the arena so spells can be crafted mid-fight.
   ([Fandom: Nebulawood](https://finalfantasy.fandom.com/wiki/Nebulawood),
   [Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))

### Move set and tells

No source we found gives **named** attacks. The bestiary-derived description
lists five behaviours, identical across the two builds as far as any source
states ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV))):

| Move | Note / tell | Counterplay |
|---|---|---|
| Runs around the battlefield | Repositioning, not an attack | — |
| Tail slap | Wide arc (the generic FFXV behemoth "turns around quickly and slams with its long tail in a wide arc") | Dodge |
| Claw swipe | — | Dodge |
| Stomp on targets under its body | **Explicitly blockable/parryable** | Block/parry |
| Charge with horns lowered | **Launches the target into the air** | Dodge |

**UNVERIFIED / IMPORTANT:** no source describes a **phase change, enrage, or
HP-threshold state change** for Deadeye in either build. Its only documented
state changes are the **Vulnerable topple** and **part breaks** (below). Our
current 40%-HP enrage has no counterpart in the source material — that does not
make it wrong, but it is invented, not adapted.

### Weak points and the break mechanic

- **Head takes −50% weapon damage until broken.** Breaking the head applies
  **Strength −30%**; breaking body/legs/tail applies **Vitality −20%** in total
  (body 5%, legs 8%, tail 10%). Head break threshold 15%.
  ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)),
  [samurai-gamers stats](https://samurai-gamers.com/final-fantasy-15-ffxv/deadeye-behemoth-enemy-stats-list/))
  Note this is the **opposite** of a naive "head = weak point": the head is
  *armoured* until you break it, and breaking it is a **damage-output nerf on
  the boss**, not a damage-input buff for the player.
- **Vulnerable (topple).** Detonating a barrel near Deadeye "causes severe damage
  to it and often makes it Vulnerable. When Deadeye is Vulnerable, it topples
  over and can't fight for a time." This is the encounter's stagger/break
  mechanic and the thing the fight teaches.
  ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)))
- **Warp-strike to the horn: NOT FOUND.** No source describes a warp-strike-to-
  the-horn mechanic. What exists is generic: point-warp to high ground to stay
  out of its way, and warp-strikes as the fallback when out of magic. The horn is
  a **100% drop appendage** (the thing you sell), not a targeted mechanic.
  ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)),
  [GameRevolution](https://www.gamerevolution.com/guides/71214-final-fantasy-xv-how-to-kill-the-deadeye-behemoth-boss))
- **"Attack its blind right side": guide folklore, UNVERIFIED as a mechanic.**
  Guides say "the weak spots are on the right side, since Deadeye is missing an
  eye and a horn there"
  ([GosuNoob](https://www.gosunoob.com/final-fantasy-xv/how-to-kill-behemoth-ffxv/)),
  and ED's ambush plan uses the blind side to lure it
  ([Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV))).
  But the stat tables contain **no right-side damage modifier** — only the head
  and the body/legs/tail break entries. The blind side is verified as
  *fiction and stealth-fiction*; it is **not verified as a damage multiplier**.

### How the fight is meant to be won

Retail teaches one lesson, and the whole arena is built to teach it:
**bait it next to an oil drum, detonate the drum with fire, and beat on the
toppled boss.** Supporting facts, all from
[Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV))
unless noted:

- Ignis explicitly suggests the tactic in dialogue (the game's own tutorialisation).
- The player receives an **AP reward** for successfully blasting Deadeye with a
  detonating oil drum — an achievement-level nudge toward the intended solution.
- Deadeye's **first descent from its perch lands it next to an easily detonated
  drum** — the arena hands you the combo on the opening beat.
- When it retreats to its perch, the counter-play is to **stand near another drum
  to bait it back** — the disengage exists to set up a *repeat* of the combo.
- Fire is its elemental weakness, and a fire deposit sits just outside the arena
  so you can never run dry.
- Lock onto the **head**, not the body, when throwing the spell, or the shot misses.
  ([GameRevolution](https://www.gamerevolution.com/guides/71214-final-fantasy-xv-how-to-kill-the-deadeye-behemoth-boss))
- Fallback when out of magic: repeated warp-strikes (i.e. the slow way).

ED teaches the same *shape* with different hardware: no magic, no barrels, so
the explosive is Prompto's gas canister, and the "and now finish it" answer is
the Ramuh summon rather than a drum loop.

### Fight length

**No written source we could find states a duration for either version.** This
is the weakest-evidenced item in this section, and it is flagged as such. The
available evidence is indirect:

- **HP.** Retail Deadeye is a level-15 mark with **89,800 HP** per the Final
  Fantasy Wiki stat table, or **48,200 HP** per samurai-gamers (see disagreement
  below). Either figure, against a party at the level the hunt is offered, is a
  multi-minute fight — it is not a 20-second fight at any plausible level-15
  damage output. This is **our inference from the stat block**, not a cited claim.
- **Capture runtimes** (video *metadata* only — we read the `lengthSeconds`
  field, we did not watch the footage, so treat the mapping runtime→fight-length
  as approximate):
  - "Final Fantasy 15: Deadeye Behemoth Boss Fight (1080p 60fps)" — **6 min 10 s**
    ([youtube.com/watch?v=j8X8_nEqF90](https://www.youtube.com/watch?v=j8X8_nEqF90))
  - "Final Fantasy XV - Deadeye Behemoth Boss Battle | A Behemoth Undertaking" —
    **2 min 26 s** ([youtube.com/watch?v=PdMmlGI_yFo](https://www.youtube.com/watch?v=PdMmlGI_yFo))
  - "FINAL FANTASY XV - Deadeye Boss Fight l A Behemoth Undertaking Quest [PS4 Pro]"
    — **13 min 15 s**, quest-inclusive
    ([youtube.com/watch?v=oHqYmvkgTPE](https://www.youtube.com/watch?v=oHqYmvkgTPE))
  - "Final Fantasy XV - Deadeye | Full Boss Fight" — **18 min 26 s**, quest-inclusive
    ([youtube.com/watch?v=iCgZLKW3sc8](https://www.youtube.com/watch?v=iCgZLKW3sc8))
  - ED **stealth section alone**: "Final Fantasy XV - Sneaking Around Deadeye
    (Behemoth Boss - Episode Duscae)" — **10 min 8 s**
    ([youtube.com/watch?v=oFCxHV8DRws](https://www.youtube.com/watch?v=oFCxHV8DRws))
  - ED **act 2** ("Ramuh + Demo Story Ending") — **6 min 16 s**
    ([youtube.com/watch?v=DJ4Eztn7wvA](https://www.youtube.com/watch?v=DJ4Eztn7wvA));
    ED **act 1 / finding Deadeye** — **19 min 13 s**
    ([youtube.com/watch?v=HMyrS3lMm-U](https://www.youtube.com/watch?v=HMyrS3lMm-U))

**Best available estimate:** the *combat* is on the order of **2–6 minutes** for
a competent player, and the *encounter as a whole* — clue hunt, stalk, ambush,
fight — is on the order of **10–20 minutes**. Our 23-second fight is roughly an
order of magnitude short of the combat alone, and two orders short of the
encounter.

### Source disagreements (do not silently pick one)

| Stat | Final Fantasy Wiki (Fandom) | samurai-gamers | Note |
|---|---|---|---|
| HP | 89,800 | 48,200 | Nearly 2×. Unresolved. Possibly different game versions/difficulty (FFXV shipped with Easy/Normal and was patched repeatedly, incl. the Royal Edition rebalance). |
| Fire multiplier | 200% in the stat table, but the prose on the same page says "taking **triple** damage from it" | 300% | The Fandom page **contradicts itself**; samurai-gamers agrees with the Fandom *prose*, not its table. |
| Spirit | 860 (in-game bestiary) / 136 (strategy guide) | 136 | The wiki itself footnotes this disagreement. |
| Strength | 2,350 | 2,200 | Minor. |

Sources: [Fandom: Deadeye](https://finalfantasy.fandom.com/wiki/Deadeye_(Final_Fantasy_XV)),
[samurai-gamers stats](https://samurai-gamers.com/final-fantasy-15-ffxv/deadeye-behemoth-enemy-stats-list/).

### Explicitly NOT verified

- **Attack names.** No source lists named moves for Deadeye — only behaviour
  descriptions. Any name we use will be invented.
- **Any HP-threshold phase change or enrage.** Not documented in any source found.
- **Whether ED's first fight is scripted-unwinnable** (see above).
- **Whether the blind right side is a damage/aggro modifier** rather than fiction.
- **Exact fight durations** — inferred, not cited.
- **Whether the Episode Duscae 2.0 update (9 June 2015) changed the Deadeye
  encounter's structure.** Coverage of 2.0 documents broad combat changes
  (free perfect guard, MP-free dodge roll, cheaper abilities, co-op attacks,
  the catoblepas) but says nothing about Deadeye's act structure; we did not find
  a source stating it was or was not changed.
  ([Fandom: Episode Duscae](https://finalfantasy.fandom.com/wiki/Final_Fantasy_XV_Episode_Duscae),
  [GearNuke, June 2015](https://gearnuke.com/final-fantasy-xv-episode-duscae-2-0-changes-detailed/))
- **Gamer Guides, Neoseeker, GameFAQs and Nova Crystallis pages returned HTTP 403
  to our fetches**; where they appear above, the quoted text comes via search-result
  extracts of those pages rather than a direct fetch, and is marked by the URL
  given. Treat those two or three lines as slightly weaker evidence than the
  directly-fetched Fandom and samurai-gamers material.
