const {launchChromium,screenshotPath}=require('./browser-launch.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await launchChromium();
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-12T00:00:00Z')});await page.goto('http://127.0.0.1:8000');await page.clock.pauseAt(new Date('2026-10-12T00:01:00Z'));
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hazure-no-kioku-v1')));
 const phase=()=>page.locator('#animation').getAttribute('data-phase');
 const noResult=async()=>assert.equal(await page.locator('#result').isVisible(),false);
 await page.locator('#urge').click();assert.equal(await phase(),'start');await noResult();
 await page.screenshot({path:screenshotPath('hazure-5s-start-390.png')});
 await page.clock.runFor(1499);assert.equal(await phase(),'start');await page.clock.runFor(1);assert.equal(await phase(),'moving');await noResult();
 assert.equal(await page.locator('.tiles b').first().evaluate(e=>getComputedStyle(e).animationName),'slow-stop');await page.clock.runFor(1000);await page.screenshot({path:screenshotPath('hazure-5s-moving-390.png')});
 await page.clock.runFor(999);assert.equal(await phase(),'moving');await page.clock.runFor(1);assert.equal(await phase(),'miss');assert.equal(await page.locator('#animation-status').textContent(),'ハズレ');assert.equal(await page.locator('#animation-status').evaluate(e=>getComputedStyle(e).fontSize),'46px');await noResult();await page.screenshot({path:screenshotPath('hazure-5s-miss-390.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.clock.runFor(1499);await noResult();await page.clock.runFor(1);assert.equal(await page.locator('#result').isVisible(),true);assert.equal((await state()).records[0].success,false);
 await page.locator('#favorite').click();await page.locator('#success').click();assert.equal((await state()).favorites.length,1);assert.equal((await state()).records.filter(r=>r.success).length,1);
 for(const delay of [0,2000,4000]){await page.locator('#urge').click();await page.clock.runFor(delay);await page.locator('#skip').click();assert.equal(await page.locator('#result').isVisible(),true);await page.clock.runFor(6000);assert.equal(await page.locator('#animation').isVisible(),false)}
 await page.locator('#urge').click();await page.locator('[data-page=settings]').click();await page.locator('#animation-setting').uncheck();await page.locator('[data-page=home]').click();assert.equal(await page.locator('#result').isVisible(),true);await page.clock.runFor(6000);assert.equal(await page.locator('#animation').isVisible(),false);
 await page.locator('#urge').click();assert.equal(await page.locator('#result').isVisible(),true);assert.equal(await page.locator('#animation').isVisible(),false);assert.equal((await state()).records.filter(r=>r.success).length,1);
 await page.locator('[data-page=settings]').click();await page.locator('#animation-setting').check();await page.locator('[data-page=home]').click();await page.locator('#urge').click();await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#result').waitFor({state:'visible',timeout:2000});assert.equal(await page.locator('#result').isVisible(),true);await page.clock.runFor(6000);assert.equal(await page.locator('#animation').isVisible(),false);
 await page.reload();await page.locator('#urge').click();assert.equal(await page.locator('#animation').isVisible(),false);assert.equal(await page.locator('#result').isVisible(),true);assert.equal((await state()).favorites.length,1);assert.equal((await state()).records.filter(r=>r.success).length,1);
 assert.equal(await page.locator('audio,video').count(),0);assert.deepEqual(errors,[]);await browser.close();console.log('PASS 390px animation boundaries 0/1500/3500/5000ms, 3-stage skip, OFF during playback, reduced motion during playback, persisted records/favorites; no page errors');
})().catch(e=>{console.error(e);process.exit(1)});
