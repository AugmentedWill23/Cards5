import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { applyCommand } from '../../src/game/engine'
import { upgradedRules } from '../../src/game/economy-update'
import { defaultRules, rarities } from '../../src/game/rules'
import { emptyWorld, type GameCommand, type GameView, type Pack } from '../../src/game/types'
import { expansionView } from '../../src/game/expansion'
import { progressionView } from '../../src/game/progression'
import { advancement, packLock } from '../../src/game/advancement'
import { casinoView } from '../../src/game/casino'
import { projectWorld } from '../../src/game/view'
import { duplicateSaleQuote } from '../../src/game/quick-sale'

// Isolated presentation fixture using the real engine, not a live Supabase account.
async function game(page: Page, cardsPerPack = 3) {
  const rules = upgradedRules(defaultRules)
  const pack: Pack = { id:'test-pack',slug:'test-pack',name:'Test Pack',subtitle:'Fixture only',
    price:100,count:cardsPerPack,color:'violet',enabled:true,
    odds:{rarity:[0,100,0,0,0,0,0,0,0,0,0,0],quality:[0,0,100,0,0,0],grade:0,mutation:0,effect:0} }
  const env=()=>({now:Date.now(),random:()=>.5,uuid:randomUUID,rules,packs:[pack],
    designs:rarities.map((rarity,i)=>({id:`d-${i}`,slug:`d-${i}`,name:`Fixture ${rarity}`,enabled:true,rarity}))})
  let world=emptyWorld(),sequence=0
  const command=(actor:string,input:Omit<GameCommand,'key'>)=>{
    const result=applyCommand(world,actor,{...input,key:randomUUID()} as GameCommand,env())
    world=result.state;sequence++;return result.result
  }
  command('a',{action:'join',name:'Alice'});command('b',{action:'join',name:'Bob'})
  const view=():GameView=>{
    const projected=projectWorld(world,rules)
    return { player:world.players.a,preview:false,rules,sequence,catalogRevision:'a'.repeat(32),
      designs:env().designs,updates:[],cards:Object.values(projected.cards).filter(c=>c.owner==='a'),
      duplicateSale:duplicateSaleQuote(Object.values(world.cards),'a',c=>projected.cards[c.id].snapshot),
      publicCards:Object.values(projected.cards),listings:[],trades:[],players:Object.values(world.players),
      receipts:world.receipts.filter(r=>r.player==='a'),ledger:world.ledger.filter(l=>l.player==='a'),sales:[],
      packs:[{...pack,lockedReason:packLock(pack,advancement(world,'a',rules),rules)}],
      serverTime:Date.now(),expansion:expansionView(world,'a',rules),
      progression:progressionView(world,'a',Date.now(),rules),casino:casinoView(world,'a',Date.now()) }
  }
  await page.route('**/api/operator',r=>r.fulfill({json:{authorized:false}}))
  await page.route('**/api/game**',async route=>{
    try{
      if(route.request().method()==='GET') await route.fulfill({json:view()})
      else {
        const result=applyCommand(world,'a',route.request().postDataJSON(),env())
        world=result.state;sequence++
        await route.fulfill({json:{result:result.result}})
      }
    }catch(error){await route.fulfill({status:400,json:{error:(error as Error).message}})}
  })
  return {command,world:()=>world,pack}
}

test('casino joins a shared lobby, settles both entries and restores battle results after refresh',async({page})=>{
  const fixture=await game(page)
  fixture.command('b',{action:'createBattle',packs:[fixture.pack.id],seats:2,mode:'shared',expectedPrice:100,expectedCatalog:'a'.repeat(32)})
  await page.goto('/casino')
  await expect(page.getByRole('heading',{name:'A seat at the table.'})).toBeVisible()
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Join battle',exact:true}).click()
  await page.getByRole('button',{name:'My battle history'}).click()
  await expect(page.getByText('COMPLETE · 2/2')).toBeVisible()
  expect(Object.keys(fixture.world().cards)).toHaveLength(6)
  await page.reload()
  await page.getByRole('button',{name:'My battle history'}).click()
  await expect(page.getByText('COMPLETE · 2/2')).toBeVisible()
  expect(fixture.world().players.a.balance).toBe(1150)
})
test('blackjack and Plinko controls use server results and reduced-motion mobile layout',async({page})=>{
  const fixture=await game(page)
  await page.setViewportSize({width:390,height:844})
  await page.emulateMedia({reducedMotion:'reduce'})
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/casino')
  await page.getByRole('tab',{name:'Blackjack',exact:true}).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:/Deal a hand/}).click()
  await expect(page.getByText(/(?:PLAYING|BLACKJACK|PUSH|LOST) · wager 10/)).toBeVisible()
  if(fixture.world().casino!.hands.a.status==='playing')
    await page.getByRole('button',{name:'Stand',exact:true}).click()
  expect(fixture.world().casino!.hands.a.status).not.toBe('playing')
  await page.getByRole('tab',{name:'Plinko',exact:true}).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:/Drop one ball/}).click()
  await expect(page.getByRole('status').filter({hasText:/Plinko: R/}).first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(errors).toEqual([])
})
test('ten pack controls, mint numbers and grading/display search render with engine-backed fixture data',async({page})=>{
  const fixture=await game(page)
  await page.goto('/packs')
  await page.getByRole('button',{name:'Open pack',exact:true}).click()
  await page.getByRole('button',{name:'10',exact:true}).click()
  await expect(page.getByRole('button',{name:/Open 10 packs/})).toBeEnabled()
  fixture.command('a',{action:'open',pack:fixture.pack.id,count:1,expectedPrice:100})
  for(const route of ['/grading','/display','/auctions']){
    await page.goto(route)
    await expect(page.getByRole('textbox',{name:route==='/grading'?'Search grading cards':route==='/display'?'Search display cards':'Search auction listings'})).toBeVisible()
  }
})
test('collection bulk select caps at fifty and can deselect a larger inventory',async({page})=>{
  const fixture=await game(page,5)
  fixture.command('a',{action:'open',pack:fixture.pack.id,count:10,expectedPrice:1000})
  fixture.command('a',{action:'open',pack:fixture.pack.id,count:1,expectedPrice:100})
  await page.goto('/collection')
  const all=page.getByRole('checkbox',{name:'Select up to 50 available cards',exact:true})
  await all.check()
  await expect(all).toBeChecked()
  await expect(page.getByRole('button',{name:/Quick-sell 50 selected/})).toBeVisible()
  await all.uncheck()
  await expect(page.getByRole('button',{name:/Quick-sell 50 selected/})).toHaveCount(0)
})
test('duplicate sales ignore filters, show the payout before confirmation, then leave one copy',async({page})=>{
  const fixture=await game(page,5)
  fixture.command('a',{action:'open',pack:fixture.pack.id,count:10,expectedPrice:1000})
  fixture.command('a',{action:'open',pack:fixture.pack.id,count:1,expectedPrice:100})
  await page.goto('/collection')
  await page.getByRole('textbox',{name:'Search your collection'}).fill('no matches')
  await page.getByRole('button',{name:'Sell all dupes (54)'}).click()
  await expect(page.getByRole('heading',{name:'Review duplicate sale'})).toBeVisible()
  const before=fixture.world().players.a.balance
  await page.getByRole('button',{name:'Keep cards',exact:true}).click()
  expect(fixture.world().players.a.balance).toBe(before)
  await page.getByRole('button',{name:'Sell all dupes (54)'}).click()
  await page.getByRole('button',{name:'Permanently quick-sell',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Quick-sold for 1,026 credits')
  expect(fixture.world().players.a.balance).toBe(before+1026)
  expect(Object.values(fixture.world().cards).filter(c=>c.status==='owned')).toHaveLength(1)
  await expect(page.getByRole('button',{name:'Sell all dupes',exact:true})).toBeDisabled()
})
test('opening reveal Quick-sell all commits all 50 cards',async({page})=>{
  const fixture=await game(page,5)
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/packs')
  await page.getByRole('button',{name:'Open pack',exact:true}).click()
  await page.getByRole('button',{name:'10',exact:true}).click()
  await page.getByRole('button',{name:/Open 10 packs/}).click()
  await page.getByRole('button',{name:'Quick-sell all',exact:true}).click()
  await page.getByRole('button',{name:'Permanently quick-sell',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Quick-sold for 950 credits')
  expect(Object.values(fixture.world().cards).filter(c=>c.status==='burned')).toHaveLength(50)
  expect(fixture.world().players.a.balance).toBe(1200)
})
test('a card detail sale and a selected sale both refresh the collection',async({page})=>{
  const fixture=await game(page)
  fixture.command('a',{action:'open',pack:fixture.pack.id,count:1,expectedPrice:100})
  await page.goto('/collection')
  await page.getByRole('button',{name:'Inspect Fixture Common, Common'}).first().click()
  await page.getByRole('button',{name:'Quick-sell',exact:true}).click()
  await page.getByRole('button',{name:'Permanently quick-sell',exact:true}).click()
  await expect(page.getByRole('button',{name:'Inspect Fixture Common, Common'})).toHaveCount(2)
  await page.getByRole('checkbox',{name:'Select up to 50 available cards'}).check()
  await page.getByRole('button',{name:'Quick-sell 2 selected',exact:true}).click()
  await page.getByRole('button',{name:'Permanently quick-sell',exact:true}).click()
  await expect(page.getByRole('button',{name:'Quick-sell 2 selected',exact:true})).toHaveCount(0)
  expect(fixture.world().players.a.balance).toBe(1207)
  expect(Object.values(fixture.world().cards).every(c=>c.status==='burned')).toBe(true)
})
