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
