#!/usr/bin/env node
/**
 * What power state was this number measured under?
 *
 *   node src/tools/power.mts            # print it
 *
 * **This machine is a laptop, and nothing in the harness knew.** `bench.mts`
 * takes a lock and refuses above a load threshold; `capturebench.mts` does the
 * same; `ruler.mts` measures a noise floor and explicitly says its variance is
 * "not thermal and not a power governor". All of that controls for OTHER
 * PROCESSES and none of it controls for the machine itself changing speed
 * underneath the measurement.
 *
 * It changes a lot. On Apple silicon, sustained GPU and CPU clocks differ
 * between AC and battery, Low Power Mode caps them further, and a long GPU
 * workload on battery drifts as the pack drains and the enclosure heats. A
 * capture harness that runs four chromiums for five minutes is exactly the
 * workload that provokes all three.
 *
 * WHY THIS EXISTS, concretely. An evening of A/B measurements produced a
 * `drawcheck` parallelism sweep of **263 s / 226 s / 239 s** at par 1 / 2 / 4,
 * and a conclusion was drawn from it. The machine was on **battery** for at
 * least part of that, and a 16% spread is inside what unplugging accounts for.
 * The conclusion was noise wearing a number's clothes. Large effects survive —
 * `uxcheck` at 53 s against 13 s is not a power mode — but nothing under about
 * 25% can be believed without this stamp.
 *
 * So: every measurement records it, and a measurement that wants to be graded
 * refuses without it. `project/LANDMINES.md`'s rule was "a number measured on a
 * busy box is not a number"; this is the same rule about the box itself.
 *
 * macOS only. Everywhere else it reports `unknown` and grades nothing, which is
 * the honest answer rather than a guess.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export interface PowerState {
  /** 'ac' | 'battery' | 'unknown' — the single biggest term. */
  source: 'ac' | 'battery' | 'unknown';
  /** Battery percentage, when there is one. */
  percent: number | null;
  /** macOS power mode: 0 automatic, 1 low, 2 high. Null when it cannot be read. */
  mode: number | null;
  /** True when macOS has recorded a thermal or performance warning. */
  throttled: boolean;
  /**
   * Is this a machine a timing number can be believed from?
   *
   * AC, not throttled, and not in Low Power Mode. Battery alone disqualifies:
   * the clocks are lower AND they drift as the pack drains, so two arms of an
   * A/B taken twenty minutes apart are not comparable even to each other.
   */
  steady: boolean;
  /** One line for a report header. */
  label: string;
}

const sh = (cmd: string, args: string[]): string => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 4000 }); } catch { return ''; }
};

export function powerState(): PowerState {
  if (process.platform !== 'darwin') {
    return { source: 'unknown', percent: null, mode: null, throttled: false, steady: false, label: 'power: unknown (not macOS)' };
  }
  const ps = sh('pmset', ['-g', 'ps']);
  const source: PowerState['source'] = /AC Power/i.test(ps) ? 'ac'
    : /Battery Power/i.test(ps) ? 'battery' : 'unknown';
  const pct = /(\d+)%/.exec(ps);
  const percent = pct ? Number(pct[1]) : null;

  const g = sh('pmset', ['-g']);
  const pm = /^\s*powermode\s+(\d+)/m.exec(g);
  const mode = pm ? Number(pm[1]) : null;

  // `pmset -g therm` prints "No thermal warning level has been recorded" when
  // clean. Anything else is the kernel telling you the clocks are not nominal.
  const therm = sh('pmset', ['-g', 'therm']);
  const throttled = /warning level/i.test(therm) && !/No .*warning level has been recorded/i.test(therm);

  const steady = source === 'ac' && !throttled && mode !== 1;
  const modeName = mode === 1 ? 'low power' : mode === 2 ? 'high power' : mode === 0 ? 'automatic' : 'unknown mode';
  const label = `power: ${source}${percent !== null ? ` ${percent}%` : ''} · ${modeName}`
    + `${throttled ? ' · THROTTLED' : ''}${steady ? '' : ' — NOT a steady bench'}`;
  return { source, percent, mode, throttled, steady, label };
}

/**
 * The sentence to print when somebody is about to believe a timing number.
 *
 * Deliberately not a hard refusal: measuring on battery is fine when the effect
 * is large (a 4x is a 4x), and refusing outright would just teach people to
 * pass a flag. Refusing to *grade* is the right severity, and that is what
 * `check.mts`'s ratchet does with this.
 */
export function powerWarning(): string | null {
  const p = powerState();
  if (p.steady) return null;
  if (p.source === 'battery') {
    return `[power] on battery${p.percent !== null ? ` (${p.percent}%)` : ''} — sustained clocks are lower `
      + 'than on AC and DRIFT as the pack drains, so two arms of an A/B taken minutes apart are not '
      + 'comparable. Plug in before believing anything under ~25%.';
  }
  if (p.throttled) return '[power] the kernel has recorded a thermal warning — the clocks are not nominal.';
  if (p.mode === 1) return '[power] Low Power Mode caps CPU and GPU clocks. Turn it off before benching.';
  return `[power] ${p.label}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const p = powerState();
  console.log(JSON.stringify(p, null, 2));
  const w = powerWarning();
  if (w) console.log(`\n${w}`);
}
