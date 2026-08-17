import { chromium } from 'playwright';
const b = await chromium.launch({args:['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:800,height:450}});
p.on('pageerror', e=>console.log('PAGEERROR:', String(e).split('\n')[0]));
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE ERR:', m.text().slice(0,200)); });
const t0=Date.now();
await p.goto('http://127.0.0.1:5299/?q=ultra&shoot=1',{waitUntil:'domcontentloaded'});
try {
  await p.waitForFunction('window.GAME && window.GAME.ready===true',null,{timeout:300000});
  console.log('READY in', ((Date.now()-t0)/1000).toFixed(1),'s');
} catch(e) {
  console.log('TIMED OUT after', ((Date.now()-t0)/1000).toFixed(1),'s');
  console.log('progress label:', await p.evaluate(()=>document.getElementById('boot-label')?.textContent));
  console.log('GAME exists:', await p.evaluate(()=>!!window.GAME));
}
await b.close();
