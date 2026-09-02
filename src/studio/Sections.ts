/**
 * The studio's top-level sections, as data.
 *
 * Both shells render from this one table rather than each hard-coding a list,
 * which is what keeps "what the studio can do" from drifting between a phone
 * and a desktop. A section that is not available on this build is absent from
 * both, not greyed out in one and missing in the other.
 *
 * **What earns a top-level slot:** it must be a distinct thing you go and *look
 * at*, not a control you use while looking at something else. Wireframe mode is
 * not a section; it is a control belonging to both explorers.
 */

export type SectionId = 'model' | 'world' | 'shots' | 'look' | 'notes' | 'device';

export interface Section {
  id: SectionId;
  /** Menu label. */
  title: string;
  /**
   * Tab-bar label, where there is no room for the full title.
   *
   * Authored rather than derived. Trimming `title` with string surgery gave
   * "Shot" for Shot Gallery, which reads as a single photograph rather than the
   * corpus of them — the sort of wrong that only shows up in a screenshot.
   */
  short: string;
  /** One line under it, saying what you would come here for. */
  desc: string;
  /**
   * Is this section offered on this build?
   *
   * Evaluated at open, not at module load, because it can depend on what the
   * page has (`Notes` needs a dev server that a static deploy does not have).
   */
  available(): boolean;
}

/**
 * Is the review endpoint present?
 *
 * `Inbox` writes through `POST /__review/note`, registered by
 * `vite-plugin-review` on the dev and preview servers only. On the deployed
 * build there is nothing behind it, so the section is hidden rather than
 * shipping a button that silently downloads JSON into a phone's Files app.
 *
 * Detected from the dev server's own marker rather than by probing the
 * endpoint: a probe would be an async question asked while the menu is being
 * drawn, and a wrong answer either way is worse than a cheap structural one.
 */
function reviewServerPresent(): boolean {
  return !!(import.meta.env && import.meta.env.DEV);
}

export const SECTIONS: Section[] = [
  {
    id: 'model',
    short: 'Models',
    title: 'Model Explorer',
    desc: 'Every character, creature, weapon and vehicle, alone on a stage',
    available: () => true,
  },
  {
    id: 'world',
    short: 'World',
    title: 'World Explorer',
    desc: 'Fly the real world — 139 places, 19 zones, 48 landforms',
    available: () => true,
  },
  {
    id: 'shots',
    short: 'Shots',
    title: 'Shot Gallery',
    desc: 'The 166 framings every nightly gate judges',
    available: () => true,
  },
  {
    id: 'look',
    short: 'Look',
    title: 'Look Lab',
    desc: 'Time of day, weather, quality tier, and how the geometry reads',
    available: () => true,
  },
  {
    id: 'notes',
    short: 'Notes',
    title: 'Notes',
    desc: 'File what you see, and read back what is still open',
    available: reviewServerPresent,
  },
  {
    id: 'device',
    short: 'Device',
    title: 'Device',
    desc: 'What this build decided at boot, and the way back',
    available: () => true,
  },
];

/** Look one up. Returns null rather than throwing: shells route on user input. */
export function sectionById(id: string): Section | null {
  return SECTIONS.find((s) => s.id === id) ?? null;
}
