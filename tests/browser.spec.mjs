import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const h=await readFile('public/index.html','utf8');
const seed=JSON.parse(h.match(/<script type="application\/json" id="oops-state">([\s\S]*?)<\/script>/)[1]);
seed.schema=3;seed.purged={};seed.statusTypes=[...new Set(Object.values(seed.cases).map(c=>c.status))];
async function mock(page,admin=false,store={state:structuredClone(seed),revision:1},conflict=false){
 await page.route('**/cloud-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.OOPS_CONFIG={url:"https://test.supabase.co",key:"test-key"}'}));
 if(admin)await page.addInitScript(()=>localStorage.setItem('sb-test-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-0000-0000-000000000001',email:'admin@example.com'}})));
 await page.route('https://test.supabase.co/**',async route=>{
 const req=route.request(),url=req.url();const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
 if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
 if(url.includes('oops_is_admin'))return route.fulfill({headers,json:admin});
 if(url.includes('oops_workspace'))return route.fulfill({headers,json:store});
 if(url.includes('oops_save_state')){const body=req.postDataJSON();if(conflict||body.expected_revision!==store.revision)return route.fulfill({headers,status:400,json:{message:'OOPS_CONFLICT'}});store.state=body.new_state;store.revision++;return route.fulfill({headers,json:store.revision});}
 return route.fulfill({headers,json:{}});
 });return store;
}
test('unconfigured build is read-only and shows all cases',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8088');await expect(page.locator('#cloud-mode')).toContainText('서버 연결 설정 필요');await expect(page.locator('#edit-toggle')).toBeDisabled();await expect(page.locator('#stat-active')).toHaveText('124');await page.selectOption('#status','보도 확인');await expect(page.locator('#result')).toContainText('98개');expect(errors).toEqual([]);});
test('public cannot edit',async({page})=>{await mock(page);await page.goto('http://127.0.0.1:8088');await expect(page.locator('#cloud-mode')).toContainText('읽기 전용');await expect(page.locator('#edit-toggle')).toBeDisabled();await expect(page.locator('.case-status-select').first()).toBeDisabled();});
test('admin edit, status, trash, restore, purge and another page',async({page,browser})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const store=await mock(page,true);await page.goto('http://127.0.0.1:8088');await expect(page.locator('#edit-toggle')).toBeEnabled();
 await page.click('#edit-toggle');const field=page.locator('#OOPS-001 .element-text').first();await field.fill('서버 저장 검증');await expect(page.locator('#cloud-mode')).toHaveText('서버 저장 완료');expect(store.state.cases['OOPS-001'].elements[0]).toBe('서버 저장 검증');
 await page.locator('#OOPS-001 .case-status-select').selectOption('보도 확인');await expect.poll(()=>store.state.cases['OOPS-001'].status).toBe('보도 확인');
 page.on('dialog',d=>d.accept());await page.locator('#OOPS-001 .delete-case').click();await expect.poll(()=>!!store.state.cases['OOPS-001'].deletedAt).toBe(true);
 await page.click('#view-trash');await page.locator('#OOPS-001 .restore-deleted').click();await expect.poll(()=>store.state.cases['OOPS-001'].deletedAt).toBe(null);
 await page.click('#view-active');await page.locator('#OOPS-001 .delete-case').click();await expect(page.locator('#cloud-mode')).toHaveText('서버 저장 완료');await page.click('#view-trash');await page.locator('#OOPS-001 .purge-case').click();await expect.poll(()=>store.state.cases['OOPS-001']).toBeUndefined();
 const other=await browser.newPage();await mock(other,false,store);await other.goto('http://127.0.0.1:8088');await expect(other.locator('#stat-active')).toHaveText('123');await expect(other.locator('#OOPS-001')).toHaveCount(0);await other.close();expect(errors).toEqual([]);
});
test('conflict blocks editing and preserves draft for JSON export',async({page})=>{await mock(page,true,undefined,true);await page.goto('http://127.0.0.1:8088');await page.click('#edit-toggle');await page.locator('#OOPS-001 .element-text').first().fill('충돌한 수정');await expect(page.locator('#cloud-mode')).toHaveText('다른 기기에서 수정됨');await expect(page.locator('#edit-toggle')).toBeDisabled();const download=page.waitForEvent('download');await page.click('#export-json');const file=await download;const json=JSON.parse(await readFile(await file.path(),'utf8'));expect(json.cases['OOPS-001'].elements[0]).toBe('충돌한 수정');});
