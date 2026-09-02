#!/usr/bin/env node
/**
 * Publish the current build to <https://ff15-xv-opus.vercel.app>.
 *
 *   node src/tools/deploy.mts              # build:full, then deploy to prod
 *   node src/tools/deploy.mts --no-build   # deploy whatever is in dist/
 *   node src/tools/deploy.mts --preview    # a preview URL, not production
 *
 * ## Why this exists rather than "just run vercel"
 *
 * `vercel deploy` with no project link **creates a new project named after the
 * directory it is run from**, and this repository has now paid for that twice:
 *
 *  1. The original deploy was run from `dist/`, so the Vercel project was
 *     literally called `dist` and the game shipped for eleven days on
 *     `dist-three-rho-86.vercel.app`.
 *  2. Renaming the project to `ff15-xv-opus` and then running `vercel deploy`
 *     again created a **second** project, also called `dist`, and published the
 *     build to `dist-lilac-sigma-18.vercel.app` — a URL nobody had, while the
 *     real one served the old build. Nothing errored. It said "Production" and
 *     a green checkmark.
 *
 * The failure is silent both times, which is what makes it worth a tool. The
 * project is pinned here by **id**, not by name, so a future rename cannot
 * repoint it and a missing link cannot invent a new project:
 * `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` are the documented CI path and they
 * take precedence over any `.vercel/project.json` on disk.
 *
 * ## Two other things that are not derivable from the repo
 *
 * - **The project has no build settings** (`framework`, `buildCommand` and
 *   `outputDirectory` are all null). It is a plain static upload of `dist/`, so
 *   the build happens here and the deploy is `cd dist && vercel deploy`. Do not
 *   "fix" this by letting Vercel build: `build:full` runs `texbake`, `geobake`
 *   and `webpbake` around two vite passes, and a plain `vite build` deletes the
 *   painted-face cache without replacing it, costing ~2.5 s of cold boot.
 * - **`build:full`, not `build`.** Same reason. `--no-build` exists for the
 *   case where you have just run it yourself.
 *
 * Auth comes from the CLI's own login (`~/Library/Application Support/
 * com.vercel.cli/auth.json`); there is no token in this repo and none is wanted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The live project, pinned by id.
 *
 * By id and not by name on purpose — a name is a display string that anybody
 * can change in a dashboard, and the whole class of bug this file exists for is
 * "the deploy went somewhere else and said it worked".
 */
const PROJECT_ID = 'prj_5c9w4yhhXm0kiK0xp2NJggb3KVDU';
const ORG_ID = 'team_HPUh311dFa6AoKlBNtS9Oiph';
const LIVE = 'https://ff15-xv-opus.vercel.app';

const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const preview = argv.includes('--preview');

const run = (cmd: string, args: string[], cwd: string) => {
  console.log(`+ ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
};

if (!noBuild) {
  // `pnpm` rather than a bare vite: `build:full` is the script that makes every
  // cache, and the difference is a measured 2.5 s of cold boot.
  run('pnpm', ['run', 'build:full'], ROOT);
}

const dist = path.join(ROOT, 'dist');
if (!existsSync(path.join(dist, 'index.html'))) {
  console.error(`no dist/index.html — nothing to deploy. Drop --no-build, or run pnpm run build:full.`);
  process.exit(1);
}

const args = ['deploy', '--yes', ...(preview ? [] : ['--prod'])];
let out: string;
try {
  out = execFileSync('vercel', args, {
    cwd: dist,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, VERCEL_ORG_ID: ORG_ID, VERCEL_PROJECT_ID: PROJECT_ID },
  });
} catch (err) {
  console.error('deploy failed.');
  if (err instanceof Error && 'status' in err) process.exit(Number(err.status) || 1);
  throw err;
}

const url = (out.match(/https:\/\/\S+\.vercel\.app/) || [])[0] || out.trim();
console.log(`\ndeployment  ${url}`);
if (!preview) console.log(`live        ${LIVE}`);

// The check that would have caught both incidents: the deployment URL for this
// project starts with the project name. A `dist-*` URL means the deploy went to
// a project called `dist` -- i.e. somewhere else -- no matter how green it was.
if (!preview && !/\/\/ff15-xv-opus/.test(url)) {
  console.error(`\nWARNING: deployment URL does not name this project.`);
  console.error(`Expected an ff15-xv-opus-* host; got ${url}.`);
  console.error(`That is the "vercel made a new project" failure. Check with:`);
  console.error(`  vercel project ls`);
  process.exit(2);
}
