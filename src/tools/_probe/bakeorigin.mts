#!/usr/bin/env node
/**
 * Which commit does the shared bake cache actually belong to?
 *
 * `bakecheck` says whether the cache matches the tree. When it does not, this
 * says what it DOES match, by re-hashing each artifact's source list at each of
 * the last N commits until one matches the stamp. That turns "STALE" into a
 * name, which is the difference between a red gate and a diagnosis.
 */
import { execFileSync } from 'node:child_process';
import { ARTIFACTS, hashSourcesAt, readStamp, hashSources } from '../bakesources.mts';

const n = Number(process.argv[2] || 60);
const log = execFileSync('git', ['log', '--format=%H %s', `-${n}`], { encoding: 'utf8' }).trim().split('\n');
for (const a of ARTIFACTS) {
  const st = readStamp(a);
  if (!st) { console.log(`${a.file.padEnd(15)} no stamp (artifact absent)`); continue; }
  const now = hashSources(a.sources, false);
  if (st.hash === now) { console.log(`${a.file.padEnd(15)} FRESH — matches the working tree`); continue; }
  let found = `NO match in the last ${n} commits`;
  for (const line of log) {
    const sp = line.indexOf(' ');
    const sha = line.slice(0, sp);
    if (hashSourcesAt(a.sources, sha) === st.hash) { found = `${sha.slice(0, 10)}  ${line.slice(sp + 1, sp + 71)}`; break; }
  }
  console.log(`${a.file.padEnd(15)} stamp ${st.hash} -> ${found}`);
}
