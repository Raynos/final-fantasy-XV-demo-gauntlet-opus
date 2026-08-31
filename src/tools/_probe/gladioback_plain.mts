/**
 * Is Gladiolus' bare back a hole in the garment, or his own arm crossing a
 * black torso?
 *
 * Lane 2 recorded the second answer from a 2.2 m framing; lane 1 recorded the
 * first from an `--hide _body` test and left it open as a pose-time skin-weight
 * divergence. A 5 m rear framing (`tmp/l12b/gladio_d5.png`) shows a tan panel
 * running from between the shoulder blades to the belt that is plainly *inside*
 * his silhouette, so the question is live again and it needs an ablation, not
 * another opinion.
 *
 * This one hides the **body**: whatever is left is garment. If the jacket
 * covers the back, the region reads black; if the region shows terrain, the
 * garment is not there in this pose.
 *
 * Run: node src/tools/framecam.mts --probe src/tools/_probe/gladioback_nobody.mts --out tmp/shots/gb-nobody --jpeg
 * No type annotations — the body is parsed as raw JS by `new Function`.
 */
const g = window.GAME;
const m = g.get('Party').get('gladio');
const ch = m.character;


return {
  hid: 'none',
  specs: [
    { name: 'gb_rear', time: 14.0, weather: 'clear', follow: 'gladio',
      offset: [0.15, 1.75, -2.2], lookOffset: [0, 1.25, 0], fov: 34 },
    { name: 'gb_rear34', time: 14.0, weather: 'clear', follow: 'gladio',
      offset: [-1.35, 1.80, -1.9], lookOffset: [0, 1.25, 0], fov: 34 },
  ],
};
