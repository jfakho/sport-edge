/** COTEGO — browser end-to-end smoke test, free GitHub Actions.
 * Uses synthetic DEMO matches only; it does not require football-data.org or Stripe keys.
 * Fails when mobile/desktop navigation, clickable match cards, or the modal regress.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base='https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev/';
const browser=await chromium.launch({headless:true});
let failures=0;
try {
  for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
    const ctx=await browser.newContext({viewport,ignoreHTTPSErrors:false,serviceWorkers:'block'});
    const page=await ctx.newPage();
    try {
      let loaded=false;
      for(let attempt=0;attempt<5;attempt++){
        try {
          const result=await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
          if(result?.ok()){loaded=true;break;}
        } catch {}
        await new Promise(resolve=>setTimeout(resolve,3000));
      }
      assert.ok(loaded,'Preview must respond HTTP 2xx');
      assert.equal(await page.locator('#page-home').count(),1);
      // PWA regression: the deployed preview must expose install metadata and assets.
      // This validates HTTP availability, not actual OS installation or offline support.
      const manifestLink=page.locator('link[rel="manifest"]');
      assert.equal(await manifestLink.count(),1,'PWA manifest link missing');
      const manifestUrl=new URL(await manifestLink.getAttribute('href'),base);
      assert.equal(manifestUrl.origin,new URL(base).origin,'PWA manifest must be same-origin');
      const manifestResponse=await ctx.request.get(manifestUrl.href);
      assert.ok(manifestResponse.ok(),'PWA manifest must be accessible');
      const manifest=await manifestResponse.json();
      assert.equal(manifest.display,'standalone','PWA standalone mode missing');
      assert.equal(manifest.start_url,'/','PWA start URL must be root');
      assert.equal(manifest.scope,'/','PWA scope must cover the app');
      assert.ok(Array.isArray(manifest.icons)&&manifest.icons.length>0,'PWA icon missing');
      for(const icon of manifest.icons){
        const iconUrl=new URL(icon.src,manifestUrl);
        assert.equal(iconUrl.origin,manifestUrl.origin,'PWA icon must be same-origin');
        assert.ok((await ctx.request.get(iconUrl.href)).ok(),'PWA icon unavailable: '+icon.src);
      }
      const swResponse=await ctx.request.get(new URL('/sw.js',base).href);
      assert.ok(swResponse.ok(),'PWA service worker script unavailable');
      console.log('PASS PWA assets and manifest at '+viewport.width+'px');
      // Regression: every featured league tab must be interactive on mobile and desktop.
      // This checks the selected state without claiming upstream match availability.
      for(const league of ['fr.1','en.1','es.1','it.1','de-live']){
        // A highlighted tab alone is not enough: the match panel must rerender.
        // Track the actual DOM node rather than assuming an upstream feed exists.
        await page.evaluate(() => {
          window.__cotegoPreviousFeaturedNode = document.querySelector('#featured-grid')?.firstElementChild ?? null;
        });
        const tab=page.locator('.home-tab[data-featured-league="'+league+'"]');
        assert.equal(await tab.count(),1,'Missing featured tab '+league);
        await tab.click();
        await assert.doesNotReject(
          () => tab.waitFor({state:'visible',timeout:3000}),
          'League tab disappeared: '+league
        );
        assert.equal(await tab.getAttribute('aria-pressed'),'true','League tab did not activate: '+league);
        const selected=await page.locator('.home-tab[aria-pressed="true"]').count();
        assert.equal(selected,1,'Exactly one featured league must be selected');
        await page.waitForFunction(() => {
          const root=document.querySelector('#featured-grid');
          return root && root.firstElementChild && root.firstElementChild !== window.__cotegoPreviousFeaturedNode;
        },null,{timeout:5000});
        assert.ok((await page.locator('#featured-grid').innerText()).trim().length>0,
          'Featured panel must show match cards or an explicit availability message for '+league);
      }
      console.log('PASS featured league tabs: all five selectable at '+viewport.width+'px');
      // Switch to isolated synthetic fixtures. No dependency on private APIs.
      const nav=viewport.width<700?'.cotego-bottom-nav button':'.sidebar button';
      await page.locator(nav+'[data-page="dashboard"]').click();
      await page.locator('#page-dashboard').waitFor({state:'visible',timeout:8000});
      await page.locator('#league-select').selectOption('demo');
      await page.locator(nav+'[data-page="home"]').click();
      await page.locator('#page-home').waitFor({state:'visible',timeout:8000});
      const visibleButton=page.locator('#featured-grid button.featured-action:not([disabled])').first();
      await visibleButton.waitFor({state:'visible',timeout:10000});
      await visibleButton.click();
      await page.locator('#analysis-modal:not(.hidden)').waitFor({state:'visible',timeout:5000});
      // Verify that the demo modal actually renders all three probability tiers.
      const picks=page.locator('#modal-content .modal-pick');
      assert.equal(await picks.count(),3,'Exactly three scenario tiers must be visible');
      const pickText=await page.locator('#modal-content').innerText();
      for(const target of ['1.50','2.00','3.00']){
        assert.ok(pickText.includes(target),'Missing theoretical-odds target '+target);
      }
      const title=await page.locator('#modal-title').innerText();
      assert.ok(title.includes(' — '),'A match title should be visible in modal');
      await page.locator('#close-modal').click();
      await page.locator('#analysis-modal.hidden').waitFor({state:'attached',timeout:5000});
      console.log('PASS COTEGO '+viewport.width+'px: demo, featured click, modal & close');
    } catch(error) {
      failures++;
      console.error('FAIL COTEGO '+viewport.width+'px: '+error.stack);
    } finally {await ctx.close();}
  }
} finally {await browser.close();}
if(failures)process.exitCode=1;
