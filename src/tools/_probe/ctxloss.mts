// Does a lost WebGL context land back in the session rather than at the title?
//
// Three failures, all invisible until they happen to a player: a reload fired
// at a tab nobody is looking at, a reload that loses where they were, and a
// device that cannot hold a context reloading forever.
const g = window.GAME;
const r = g.rnd;
const out = { hook: typeof r.onContextRestored };

// 1. The hook answers with a search string carrying `continue`, and keeps
//    whatever mode this page is in.
const search = r.onContextRestored ? r.onContextRestored() : null;
out.search = search;
out.carriesContinue = !!search && new URLSearchParams(search).has('continue');
out.keptDemo = !!search
  && new URLSearchParams(search).get('demo') === new URLSearchParams(location.search).get('demo');

// 2. The loop guard, through the `_navigate` seam so the page stays put.
const seen = [];
r._navigate = (sr) => { seen.push(sr); };
sessionStorage.removeItem('ffxv:ctxlost');
for (let i = 0; i < 4; i++) r._reloadIntoSession();
out.navigationsAfterFourLosses = seen.length;
out.everyNavigationCarriedTheSession = seen.every((sr) => sr && sr.includes('continue'));
out.counter = sessionStorage.getItem('ffxv:ctxlost');
sessionStorage.removeItem('ffxv:ctxlost');
return out;
