const {launchChromium,screenshotPath}=require('./browser-launch.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await launchChromium();
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-13T00:00:00Z')});await page.goto('http://127.0.0.1:8000');await page.clock.pauseAt(new Date('2026-10-13T00:01:00Z'));
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hazure-no-kioku-v1')));
 const phase=()=>page.locator('#animation').getAttribute('data-phase');
 const caption=()=>page.locator('#animation-announcement').textContent();
 const slots=()=>page.locator('#animation .tiles>span').evaluateAll(nodes=>nodes.map(n=>n.dataset.state));
 const noResult=async()=>assert.equal(await page.locator('#result').isVisible(),false);
 const fitting=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#animation .tiles b').evaluateAll(nodes=>nodes.every(n=>parseFloat(getComputedStyle(n).fontSize)>=48)),true);};
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});const count=(await state())?.records.length||0;
  await page.locator('#urge').click();assert.equal(await phase(),'left');assert.deepEqual(await slots(),['falling','waiting','waiting']);await noResult();await fitting();assert.equal(await caption(),'今度こそ、当たるかも。');assert.equal(await page.locator('#animation').getAttribute('data-caption'),'first');
  await page.screenshot({path:screenshotPath(`hazure-767-caption-first-${width}.png`)});
  assert.deepEqual(await page.locator('#animation .tiles b').allTextContents(),['７','６','７']);assert.equal(await page.locator('#urge').isDisabled(),true);
  await page.evaluate(()=>{for(let i=0;i<10;i++)document.getElementById('urge').onclick()});assert.equal((await state()).records.length,count+1);
  assert.equal(await page.locator('#animation .tiles b').first().evaluate(e=>getComputedStyle(e).animationName),'digit-drop');
  // CSS animation uses the browser timeline; seek its frames independently of the JS clock.
  const frames=await page.locator('#animation .tiles b').first().evaluate(e=>{const a=e.getAnimations()[0];a.pause();return [0,1200,1350,1500].map(t=>{a.currentTime=t;return new DOMMatrixReadOnly(getComputedStyle(e).transform).m42})});
  assert.ok(frames[0]<-80);assert.ok(Math.abs(frames[1])<.1);assert.ok(frames[2]<-4);assert.ok(Math.abs(frames[3])<.1);
  await page.clock.runFor(1499);assert.deepEqual(await slots(),['falling','waiting','waiting']);await page.clock.runFor(1);assert.deepEqual(await slots(),['landed','waiting','waiting']);assert.equal(await caption(),'今度こそ、当たるかも。');
  await page.clock.runFor(299);assert.equal(await phase(),'left');await page.clock.runFor(1);assert.equal(await phase(),'right');assert.deepEqual(await slots(),['landed','waiting','falling']);assert.equal(await caption(),'今度こそ、当たるかも。');await noResult();
  await page.clock.runFor(1499);assert.equal((await slots())[2],'falling');assert.equal(await caption(),'今度こそ、当たるかも。');await page.clock.runFor(1);assert.deepEqual(await slots(),['landed','waiting','landed']);assert.equal(await caption(),'そう思って、何度目だろう。');assert.equal(await page.locator('#animation').getAttribute('data-caption'),'second');
  await page.clock.runFor(299);assert.equal(await phase(),'right');await page.clock.runFor(1);assert.equal(await phase(),'center');assert.deepEqual(await slots(),['landed','falling','landed']);assert.equal(await caption(),'そう思って、何度目だろう。');assert.equal(await page.locator('[data-line=second]').evaluate(e=>getComputedStyle(e).transitionDuration),'0.18s');await noResult();
  assert.equal(await page.locator('[data-line=second]').evaluate(e=>getComputedStyle(e).transitionDelay),'0.18s');
  await page.locator('#animation .animation-line').evaluateAll(nodes=>nodes.forEach(e=>e.getAnimations().forEach(a=>a.finish())));
  assert.equal(await page.locator('[data-line=first]').evaluate(e=>getComputedStyle(e).opacity),'0');assert.equal(await page.locator('[data-line=second]').evaluate(e=>getComputedStyle(e).opacity),'1');
  assert.equal(await page.locator('.animation-phrase').evaluateAll(nodes=>nodes.every(e=>{const r=e.getBoundingClientRect(),p=e.closest('#animation-status').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom})),true);await page.screenshot({path:screenshotPath(`hazure-767-caption-second-${width}.png`)});
  await page.clock.runFor(1499);assert.equal(await phase(),'center');assert.equal(await caption(),'そう思って、何度目だろう。');await page.clock.runFor(1);assert.equal(await phase(),'miss');assert.deepEqual(await slots(),['landed','landed','landed']);assert.equal(await caption(),'ハズレ');assert.equal(await page.locator('#animation').getAttribute('data-caption'),'miss');assert.equal(await page.locator('[data-line=second]').evaluate(e=>getComputedStyle(e).opacity),'0');assert.equal(await page.locator('[data-line=miss]').evaluate(e=>getComputedStyle(e).opacity),'1');await noResult();await fitting();
  assert.equal(await page.locator('#animation .tiles b').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom})),true);
  await page.screenshot({path:screenshotPath(`hazure-767-miss-${width}.png`)});
  await page.clock.runFor(899);await noResult();await page.clock.runFor(1);assert.equal(await page.locator('#result').isVisible(),true);assert.equal((await state()).records.at(-1).success,false);assert.ok(await page.locator('#message').textContent());
 }
 await page.locator('#favorite').click();await page.locator('#success').click();assert.equal((await state()).favorites.length,1);assert.equal((await state()).records.filter(r=>r.success).length,1);
 // Skip each phase, then immediately start another run: no stale callbacks/results.
 for(const delay of [0,2000,4000,5500]){
  await page.locator('#urge').click();await page.clock.runFor(delay);await page.locator('#skip').click();assert.equal(await page.locator('#result').isVisible(),true);
  await page.locator('#urge').click();await page.clock.runFor(1000);assert.equal(await phase(),'left');assert.equal(await caption(),'今度こそ、当たるかも。');await noResult();await page.locator('#skip').click();await page.clock.runFor(7000);assert.equal(await page.locator('#animation').isVisible(),false);
 }
 // Navigation finishes only the current visual sequence, and does not steal focus.
 for(const destination of ['history','words','settings']){
  await page.locator('#urge').click();const before=(await state()).records.length;await page.clock.runFor(2000);await page.locator(`[data-page=${destination}]`).click();
  assert.equal(await page.locator(`#${destination}`).isVisible(),true);assert.equal(await page.locator('#urge').isDisabled(),false);assert.notEqual(await page.evaluate(()=>document.activeElement.id),'result');
  await page.clock.runFor(7000);assert.equal((await state()).records.length,before);await page.locator('[data-page=home]').click();assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#animation').isVisible(),false);
 }
 await page.locator('#urge').click();await page.evaluate(()=>document.getElementById('open-plus').click());await page.waitForFunction(()=>!document.getElementById('urge').disabled);assert.equal(await page.locator('#plus').isVisible(),true);await page.clock.runFor(7000);await page.locator('#plus-back').click();assert.equal(await page.locator('#result').isVisible(),true);
 await page.locator('[data-page=settings]').click();await page.locator('#animation-setting').uncheck();await page.locator('[data-page=home]').click();await page.locator('#urge').click();assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#animation').isVisible(),false);
 await page.locator('[data-page=settings]').click();await page.locator('#animation-setting').check();await page.locator('[data-page=home]').click();await page.locator('#urge').click();await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#result').waitFor({state:'visible',timeout:2000});await page.clock.runFor(7000);assert.equal(await page.locator('#animation').isVisible(),false);
 await page.reload();await page.locator('#urge').click();assert.equal(await page.locator('#animation').isVisible(),false);assert.equal(await page.locator('#result').isVisible(),true);assert.equal((await state()).favorites.length,1);assert.equal((await state()).records.filter(r=>r.success).length,1);
 assert.equal(await page.locator('audio,video').count(),0);assert.deepEqual(errors,[]);await browser.close();console.log('PASS 767 animation: 320/390px, six-second boundaries, left/right/center fall and bounce, fixed digits/miss, two captions at 0/3300ms with fade and restart reset, rapid clicks, skip/restart, all page switches, OFF/reduced-motion, unchanged record/success/favorite semantics; no browser errors');
})().catch(e=>{console.error(e);process.exit(1)});
