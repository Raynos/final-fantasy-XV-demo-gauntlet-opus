/* Arm each staged fight through the real quest path, and hand back a framing
   of the boss that is actually standing there. For `framecam.mts --probe`. */
const g = window.GAME;
const log = [];
const rpg = g.get('Rpg');
const dir = g.get('Director');
const enc = g.get('Encounters');
const player = g.get('Player');
const terr = g.get('Terrain');
const enemies = g.get('Enemies');
const menus = g.get('Menus');
const party = g.get('Party');
const S = await import('/game/encounters/SpawnTables.ts');
const Q = await import('/game/rpg/Quests.ts');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const goTo = (x, z) => {
  const y = terr.heightAt(x, z);
  player.root.position.set(x, y, z);
  g.camera.position.set(x, y + 3, z + 8);
  g.camera.lookAt(x, y + 1.2, z);
  party.snap?.();
  step(4);
  player.root.position.set(x, y, z);
  step(8);
};

g.input.pointerLocked = true;
g.get('Story')?._resume?.();
dir.play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

const specs = [];
for (const q of Object.values(Q.QUESTS).filter((x) => x.setPiece)) {
  for (const r of q.requires || []) {
    if (rpg.quests.status(r) !== 'complete') { rpg.quests.states[r].status = 'active'; rpg.quests.complete(r); }
  }
  rpg.quests.refresh();
  if (rpg.quests.status(q.id) === 'available') rpg.quests.accept(q.id);
  const st = rpg.quests.state(q.id);
  for (let i = 0; i < q.objectives.length; i++) {
    const o = q.objectives[i];
    if (o.type === 'kill') break;
    if (st.objectives[i].done) continue;
    if (o.type === 'reach') { goTo(o.waypoint[0], o.waypoint[2]); rpg.quests.notify('reach', { target: o.target }); }
    else if (o.type === 'talk') rpg.quests.notify('talk', { target: o.target });
    step(4);
  }
  const kill = q.objectives.find((o) => o.type === 'kill');
  goTo(kill.waypoint[0], kill.waypoint[2]);
  step(50);

  const boss = enemies.list.find((e) => !e.dead && e.boss);
  if (!boss) { log.push(`${q.setPiece}: NO BOSS`); continue; }

  // Freeze it mid-telegraph and stand the party in front of it, the way
  // `Director._bossScenario` poses the corpus shots. Without this the boss is
  // still chasing when `framecam` applies the framing several frames later,
  // and every frame comes back as empty grass with the boss out of shot.
  const A = boss.attacks && boss.attacks[0];
  if (A) { boss.attackId = A.id; boss.attack = A; }
  boss.freeze?.('telegraph', 30);
  boss.target = player;
  const p = boss.root.position.clone();
  const h = boss.height || 3;
  const back = Math.max(11, h * 3.2);
  player.root.position.set(p.x + back * 0.55, terr.heightAt(p.x + back * 0.55, p.z + back * 0.55), p.z + back * 0.55);
  player.heading = Math.atan2(p.x - player.root.position.x, p.z - player.root.position.z);
  player.root.rotation.y = player.heading;
  party.snap?.();
  step(2);

  log.push(`${q.setPiece}: ${boss.name ?? boss.speciesId} ${Math.round(boss.hp)} hp at (${p.x.toFixed(0)},${p.z.toFixed(0)}) h=${h.toFixed(1)}`);
  specs.push({
    name: q.setPiece,
    pos: [p.x + back * 0.72, p.y + h * 0.75, p.z + back * 0.72],
    target: [p.x, p.y + h * 0.45, p.z],
    fov: 42,
    time: 15.2,
    weather: 'clear',
    hud: false,
  });
  // The fight stays up. Each framing is captured before the next one arms, and
  // a frozen boss does not wander out of its own shot.
}

return { log, specs };
