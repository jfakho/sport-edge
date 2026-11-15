/** COTEGO — browser end-to-end smoke test, free GitHub Actions.
 * Checks one actual featured forecast plus isolated synthetic DEMO navigation.
 * Both viewports reuse the same verified HTTP feed within this test run;
 * provider availability is checked independently by the smoke-preview job.
 * Requires the public football feed, but never handles a provider or Stripe key.
 * Fails when mobile/desktop navigation, clickable match cards, or the modal regress.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base='https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev/';
const browser=await chromium.launch({headless:true});
const verifiedFeeds=new Map();
let failures=0;
try {
  for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
    const ctx=await browser.newContext({viewport,ignoreHTTPSErrors:false,serviceWorkers:'block'});
    // Keep layout regression checks from consuming the free provider quota twice.
    // Cache only actual successful COTEGO API responses, never invented fixtures,
    // and only in memory for this single test execution.
    await ctx.route('**/api/football*',async route=>{
      const url=route.request().url();
      if(new URL(url).origin!==new URL(base).origin)return route.continue();
      const cached=verifiedFeeds.get(url);
      if(cached)return route.fulfill({status:200,contentType:'application/json',body:cached});
      const response=await route.fetch();
      const body=await response.text();
      try {
        if(response.ok()&&JSON.parse(body)?.ok===true)verifiedFeeds.set(url,body);
      } catch {}
      return route.fulfill({response,body});
    });
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
      assert.match(manifestResponse.headers()['content-type']||'',/application\/(manifest\+json|json)/i,'PWA manifest must return JSON, not an HTML fallback');
      const manifest=await manifestResponse.json();
      assert.equal(manifest.display,'standalone','PWA standalone mode missing');
      assert.equal(manifest.start_url,'/','PWA start URL must be root');
      assert.equal(manifest.scope,'/','PWA scope must cover the app');
      assert.ok(Array.isArray(manifest.icons)&&manifest.icons.length>0,'PWA icon missing');
      for(const icon of manifest.icons){
        const iconUrl=new URL(icon.src,manifestUrl);
        assert.equal(iconUrl.origin,manifestUrl.origin,'PWA icon must be same-origin');
        const iconResponse=await ctx.request.get(iconUrl.href);
        assert.ok(iconResponse.ok(),'PWA icon unavailable: '+icon.src);
        assert.match(iconResponse.headers()['content-type']||'',/^image\//i,'PWA icon must return an image, not an HTML fallback: '+icon.src);
      }
      const swResponse=await ctx.request.get(new URL('/sw.js',base).href);
      assert.ok(swResponse.ok(),'PWA service worker script unavailable');
      assert.match(swResponse.headers()['content-type']||'',/(javascript|ecmascript)/i,'Service worker must return JavaScript, not an HTML fallback');
      assert.match(await swResponse.text(),/\b(?:self|addEventListener)\b/,'Service worker script appears empty or invalid');
      console.log('PASS PWA assets and manifest at '+viewport.width+'px');
      // Actual-data regression: a featured card and its detail must use the same
      // historical snapshot, even while the larger single-league feed is loaded.
      const actualCard=page.locator('#featured-grid .featured-card').first();
      // A successful page load can precede a slow, rate-limited featured feed.
      // Retry the real preview request without substituting synthetic fixtures.
      let featuredReady=false;
      for(let attempt=0;attempt<3;attempt++){
        try {
          await actualCard.waitFor({state:'visible',timeout:15000});
          featuredReady=true;
          break;
        } catch(error) {
          if(attempt===2)throw error;
          console.warn('Featured cards not ready; retrying real preview load '+(attempt+1));
          await page.reload({waitUntil:'domcontentloaded',timeout:25000});
        }
      }
      assert.ok(featuredReady,'Actual featured cards unavailable after retries');
      // Old or undated football photos must not replace the club identities.
      const badges=actualCard.locator('.club-crest');
      assert.equal(await badges.count(),2,'Both clubs need their verified crest');
      await page.waitForFunction(()=>[...document.querySelectorAll('#featured-grid .featured-card:first-child .club-crest')].length===2&&[...document.querySelectorAll('#featured-grid .featured-card:first-child .club-crest')].every(i=>i.complete&&i.naturalWidth>0));
      const datedPhotos=await page.locator('#featured-grid .fixture-photo').evaluateAll(images=>images.map(i=>i.dataset.capturedAt));
      for(const capturedAt of datedPhotos)assert.equal(await page.evaluate(d=>window.CotegoMedia.isPhotoAllowed({capturedAt:d},'football'),capturedAt),true,'Every football photo must satisfy the date rule');
      const beforeView=await actualCard.locator('.featured-scenario-market').allTextContents();
      await page.locator('[data-fixture-view="list"]').click();
      assert.ok(await badges.first().isHidden(),'List view must hide the large crests');
      assert.deepEqual(await actualCard.locator('.featured-scenario-market').allTextContents(),beforeView,'Layout must preserve analyses');
      await page.locator('[data-fixture-view="photos"]').click();
      assert.ok(await badges.first().isVisible(),'Affiches view must restore club crests');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Layout must fit viewport');
      const rows=actualCard.locator('.featured-scenario');
      const rowPositions=await rows.evaluateAll(items=>items.map(el=>el.getBoundingClientRect().y));
      assert.ok(rowPositions[0]<rowPositions[1]&&rowPositions[1]<rowPositions[2],'Scenarios must read as three rows');
      console.log('PASS club crests, recent-photo policy and scenario rows at '+viewport.width+'px');
      const featuredFeed=[...verifiedFeeds.values()].map(body=>JSON.parse(body)).find(feed=>Array.isArray(feed.competitions));
      const french=featuredFeed?.competitions.find(c=>c.league==='fr.1'&&c.ok);
      assert.ok(french,'Verified Ligue 1 feed is required for club identity checks');
      const parisNames=new Map();
      for(const match of [...french.matches,...french.historicalMatches]){
        for(let side=0;side<2;side++)if([524,1045].includes(match._teamIds?.[side])){
          const id=match._teamIds[side],name=match['team'+(side+1)];
          assert.equal(name,id===524?'Paris Saint-Germain':'Paris FC');
          parisNames.set(id,name);
        }
      }
      // Live provider windows may not include fixtures for both Paris clubs.
      // Validate every identity actually present; the exhaustive two-club
      // mapping is covered by deterministic adapter unit tests.
      console.log('Verified Paris club IDs in current feed: '+[...parisNames.keys()].join(', ')+' (absence is not a mapping failure)');
      const marketNames=await actualCard.locator('.featured-scenario-market').allTextContents();
      const marketPercentages=(await actualCard.locator('.featured-scenario-prob').allTextContents())
        .map(text=>Number(text.match(/(\d+) %/)?.[1]));
      const sample=(await actualCard.locator('.featured-confidence').innerText()).match(/(\d+) résultats historiques/)?.[1];
      assert.equal(marketNames.length,3,'Actual featured card needs three scenarios');
      assert.ok(sample,'Actual featured sample size must be shown');
      await actualCard.locator('button.featured-action').click();
      await page.locator('#analysis-modal:not(.hidden)').waitFor({state:'visible',timeout:5000});
      assert.deepEqual(await page.locator('#modal-content .modal-pick h4').allTextContents(),marketNames,
        'Opening details must preserve the card scenario selections');
      const detailPercentages=(await page.locator('#modal-content .modal-pick p b:first-child').allTextContents())
        .map(text=>Math.round(Number.parseFloat(text)));
      assert.deepEqual(detailPercentages,marketPercentages,
        'Opening details must preserve the card probabilities, allowing display rounding');
      const comparison=page.locator('#modal-content .manual-odd').first();
      assert.equal(await comparison.getAttribute('open'),null,'Manual odds entry must be optional');
      await comparison.locator('summary').click();
      assert.ok(await comparison.locator('.odd-input').isVisible(),'Optional odds comparison must stay accessible');
      await page.locator('#modal-content .analysis-method > summary').click();
      assert.ok(await page.locator('#modal-content .model-warning').isVisible(),'Method must remain accessible');
      assert.ok((await page.locator('#modal-content .model-warning').innerText()).includes('Calcul basé sur '+sample+' résultats'),
        'Card and detail must share their historical sample');
      await page.locator('#close-modal').click();
      console.log('PASS actual featured forecast consistency at '+viewport.width+'px');
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
      // Past scenarios must remain inspectable on both form factors, with
      // explicit retrospective labeling and no fictional archived forecasts.
      await page.evaluate(()=>document.querySelector('.sidebar [data-page="history"]').click());
      await page.locator('#page-history').waitFor({state:'visible',timeout:5000});
      await page.locator('#history-league-select').selectOption('demo');
      await page.locator('.retrospective-section').evaluate(el=>el.setAttribute('open',''));
      const past=page.locator('#backtest-content [data-analyze]').first();
      await past.waitFor({state:'visible',timeout:5000});
      const historyText=await page.locator('#backtest-content').innerText();
      assert.ok(historyText.includes('Données fictives de démonstration.'));
      assert.ok(historyText.includes('scénarios évalués'));
      assert.ok(historyText.includes('Non réalisé'),'Losing scenarios must be visible');
      await past.click();
      await page.locator('#analysis-modal:not(.hidden)').waitFor({state:'visible',timeout:5000});
      assert.equal(await page.locator('#modal-content .modal-pick').count(),3);
      assert.equal(await page.locator('#modal-content .odd-input').count(),0,'No current odds input for a finished fixture');
      const pastText=await page.locator('#modal-content').innerText();
      assert.ok(pastText.includes('Score final (90 min) :'));
      assert.ok(pastText.includes('pas de prévision archivée'));
      await page.locator('#close-modal').click();
      console.log('PASS past scenario results and detail at '+viewport.width+'px');
    } catch(error) {
      failures++;
      console.error('FAIL COTEGO '+viewport.width+'px: '+error.stack);
    } finally {await ctx.close();}
  }
} finally {await browser.close();}
if(failures)process.exitCode=1;
