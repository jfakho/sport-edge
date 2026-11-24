import assert from 'node:assert/strict';

// Run against real provider snapshots; no synthetic sporting results.
export async function verifyMobileJourney(page,{searchTeam='Chelsea',capture=async()=>{}}={}){
  const checks=[];
  const home=()=>page.locator('.cotego-bottom-nav [data-page="home"]').click();
  const cards=page.locator('#featured-grid .featured-card');
  const catalog=page.locator('#matches-list .match-card');
  await cards.first().waitFor({state:'visible'});
  await page.locator('.home-tab[data-featured-league="fr.1"]').click();
  await cards.first().locator('.featured-favorite').click();
  await page.locator('.home-tab[data-featured-league="en.1"]').click();
  await cards.first().locator('.featured-favorite').click();
  await page.locator('.home-tab[data-featured-league="fr.1"]').click();
  await page.locator('#global-search-input').fill(searchTeam);
  await page.locator('#global-search button').click();
  await catalog.first().waitFor({state:'visible'});
  assert.equal(await page.locator('#league-select').inputValue(),'all');
  assert.ok((await catalog.allTextContents()).every(t=>t.includes(searchTeam)));
  await catalog.first().locator('.analysis-btn').click();
  await page.locator('#analysis-modal:not(.hidden)').waitFor();
  assert.ok((await page.locator('#modal-title').innerText()).includes(searchTeam));
  assert.match(await page.locator('#modal-subtitle').innerText(),/Premier League/);
  assert.equal(await page.locator('#modal-content .modal-pick').count(),3);
  await capture('search-analysis');await page.locator('#close-modal').click();
  checks.push('Global search from Ligue 1 finds an English team and opens its correct three-scenario analysis');
  await page.locator('.cotego-bottom-nav [data-favs="1"]').click();
  assert.equal(await catalog.count(),2);
  assert.equal(await page.locator('.cotego-bottom-nav button.active').count(),1);
  assert.deepEqual(new Set(await catalog.locator('.league-pill').allTextContents()),new Set(['LIGUE 1','PREMIER LEAGUE']));
  const contrast=await catalog.first().evaluate(card=>{
    const luminance=color=>{
      const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    return ['.scenario-name','.analysis-btn'].map(selector=>{
      const style=getComputedStyle(card.querySelector(selector)),foreground=luminance(style.color);
      const background=luminance(selector==='.analysis-btn'?style.backgroundColor:getComputedStyle(card).backgroundColor);
      return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
    });
  });
  assert.ok(contrast.every(ratio=>ratio>=4.5),'Scenario text and analysis buttons must remain readable on the light background');
  await catalog.first().scrollIntoViewIfNeeded();
  await capture('favorites');
  await page.reload({waitUntil:'networkidle'});
  await cards.first().waitFor();
  await page.locator('.cotego-bottom-nav [data-favs="1"]').click();
  assert.equal(await catalog.count(),2);
  assert.equal(await page.locator('.cotego-bottom-nav button.active').count(),1);
  await catalog.first().locator('.favorite-button').click();
  assert.equal(await catalog.count(),1);
  checks.push('Favorites from two competitions survive reload; removing one updates the list');
  await home();
  for(const league of ['fr.1','en.1','es.1','it.1','de-live','intl.cl']){
    await page.locator('.home-tab[data-featured-league="'+league+'"]').click();
    assert.equal(await cards.count(),3);
    assert.ok(await page.locator('.home-tab[aria-pressed="true"]').evaluate(el=>{
      const tab=el.getBoundingClientRect(),strip=el.parentElement.getBoundingClientRect();
      return tab.left>=strip.left-1&&tab.right<=strip.right+1;
    }),'The selected competition must stay visible in the mobile tab strip');
    const names=await cards.first().locator('.featured-scenario-market').allTextContents();
    const probs=(await cards.first().locator('.scenario-probability').allTextContents()).map(t=>parseInt(t,10));
    await cards.first().locator('.featured-action').click();
    await page.locator('#analysis-modal:not(.hidden)').waitFor();
    assert.deepEqual(await page.locator('#modal-content .modal-pick h4').allTextContents(),names);
    assert.deepEqual((await page.locator('#modal-content .modal-pick p b:first-child').allTextContents()).map(t=>Math.round(parseFloat(t))),probs);
    await page.locator('#modal-content .modal-pick').last().scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#modal-content .modal-pick').last().isVisible());
    await page.locator('#close-modal').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  checks.push('Six competition tabs, all three scenarios and card/detail probabilities checked');
  await page.locator('.home-tab[data-featured-league="fr.1"]').click();
  await page.locator('.sports-results').click();
  await page.locator('.journal-record').first().waitFor();
  await page.locator('.journal-detail-link').first().click();
  await page.locator('#analysis-modal:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modal-content .modal-pick').count(),3);
  await page.locator('#close-modal').click();
  await capture('history');checks.push('Persisted prediction history and archived three-scenario analysis open');
  await page.locator('.cotego-bottom-nav [data-page="dashboard"]').click();
  await page.locator('#search-input').fill('NoSuchTeamAudit');
  await page.locator('#clear-filters').click();
  assert.ok(await catalog.count()>0);
  checks.push('Empty search can be reset without a dead end');
  await home();
  await page.locator('#mobile-menu').click();
  await page.locator('.sidebar [data-competition="intl.cl"]').click();
  assert.ok(!await page.locator('.sidebar').evaluate(el=>el.classList.contains('open')));
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  await capture('home');checks.push('Mobile menu opens, selects Champions League and closes');
  return checks;
}
