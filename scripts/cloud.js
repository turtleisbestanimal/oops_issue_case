import { createClient } from '@supabase/supabase-js';
const cfg=window.OOPS_CONFIG||{};
const status=document.querySelector('#editor-status');
const panel=document.createElement('section');panel.className='cloud-panel';panel.setAttribute('aria-label','서버 저장과 관리자 로그인');
panel.innerHTML=`<div class="cloud-row"><strong id="cloud-mode">서버 연결 확인 중…</strong><span id="cloud-account"></span><button id="cloud-login-open" type="button">관리자 로그인</button><button id="cloud-logout" type="button" hidden>로그아웃</button><button id="cloud-retry" type="button" hidden>저장 재시도</button><button id="cloud-reload" type="button">최신 내용 불러오기</button></div><form id="cloud-login" hidden><label>이메일 <input id="cloud-email" type="email" autocomplete="username" required></label><label>비밀번호 <input id="cloud-password" type="password" autocomplete="current-password" required></label><button type="submit">로그인</button><button id="cloud-cancel" type="button">취소</button></form><p id="cloud-info" role="status" aria-live="polite"></p>`;
status.before(panel);
const $=s=>panel.querySelector(s);
let client,revision=null,loaded=null,pending=null,saving=false,blocked=false,failed=false,seq=0;
const cloud=window.OopsCloud={canEdit:false,readOnly:true,dirty:false,ready:null,touch(){seq++;cloud.dirty=true;},save,load:()=>loaded};
function info(text,error=false){$('#cloud-info').textContent=text;$('#cloud-info').classList.toggle('storage-error',error);}
function permission(allowed){cloud.canEdit=allowed;cloud.readOnly=!allowed;document.dispatchEvent(new Event('oops-permission'));}
function mode(text){$('#cloud-mode').textContent=text;}
function failure(error){const conflict=error?.message?.includes('OOPS_CONFLICT');blocked=conflict;failed=true;permission(false);$('#cloud-retry').hidden=conflict;mode(conflict?'다른 기기에서 수정됨':'서버 저장 실패');info(conflict?'저장되지 않은 수정이 있습니다. JSON 백업을 내려받고 최신 내용을 불러온 뒤 반영하세요. 자동 덮어쓰기를 중단했습니다.':'저장되지 않은 수정이 있습니다. JSON 백업을 보관하고 저장 재시도를 누르세요.',true);}
async function drain(){
 if(saving||blocked||failed||!pending)return;
 saving=true;mode('서버 저장 중…');
 try{
  while(pending){
   const task=pending;pending=null;
   const {data,error}=await client.rpc('oops_save_state',{expected_revision:revision,new_state:task.state});
   if(error){if(!pending)pending=task;throw error;}
   revision=data;loaded=task.state;
   if(task.seq===seq){cloud.dirty=false;mode('서버 저장 완료');info('서버에 저장했습니다. 다른 기기에서도 최신 내용을 확인할 수 있습니다.');document.dispatchEvent(new Event('oops-saved'));}
  }
 }catch(error){failure(error);}finally{saving=false;}
}
function save(state){
 if(!cloud.canEdit||blocked)return;
 // Only explicit user changes call save; startup, export, blur and pagehide never write.
 pending={state:structuredClone(state),seq:++seq};cloud.dirty=true;drain();
}
$('#cloud-login-open').onclick=()=>{$('#cloud-login').hidden=!$('#cloud-login').hidden;$('#cloud-email').focus();};
$('#cloud-cancel').onclick=()=>{$('#cloud-login').hidden=true;$('#cloud-password').value='';};
$('#cloud-login').onsubmit=async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{const {error}=await client.auth.signInWithPassword({email:$('#cloud-email').value.trim(),password:$('#cloud-password').value});$('#cloud-password').value='';if(error)throw error;location.reload();}
 catch{info('로그인하지 못했습니다. 이메일과 비밀번호를 확인하세요.',true);}finally{button.disabled=false;}
};
$('#cloud-logout').onclick=async()=>{if(cloud.dirty){info('저장이 끝난 뒤 로그아웃하세요. 저장 실패 시 JSON 백업을 먼저 보관하세요.',true);return;}await client.auth.signOut();location.reload();};
$('#cloud-reload').onclick=()=>{if(!cloud.dirty||confirm('서버에 저장되지 않은 수정은 사라집니다. JSON 백업을 보관했나요? 최신 내용을 불러올까요?')){cloud.dirty=false;location.reload();}};
$('#cloud-retry').onclick=()=>{failed=false;permission(true);$('#cloud-retry').hidden=true;drain();};
window.addEventListener('beforeunload',event=>{if(cloud.dirty){event.preventDefault();event.returnValue='';}});
cloud.ready=(async()=>{
 if(!cfg.url||!cfg.key){mode('읽기 전용 · 서버 연결 설정 필요');$('#cloud-login-open').disabled=true;info('사례를 열람할 수 있습니다. 서버 연결 설정을 완료하면 관리자 로그인 후 자동 저장할 수 있습니다.');return null;}
 try{
  client=createClient(cfg.url,cfg.key);
  const {data:{session},error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
  let admin=false;if(session){const {data,error}=await client.rpc('oops_is_admin');if(error)throw error;admin=data===true;$('#cloud-account').textContent=session.user.email||'';$('#cloud-logout').hidden=false;$('#cloud-login-open').hidden=true;}
  const {data,error}=await client.from('oops_workspace').select('state,revision').eq('id',1).single();if(error)throw error;
  loaded=data.state;revision=data.revision;permission(admin);mode(admin?'서버 연결됨 · 관리자':'서버 연결됨 · 읽기 전용');info(admin?'수정 내용은 자동으로 서버에 저장됩니다.':'관리자만 사례를 수정할 수 있습니다.');
  client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){permission(false);info('로그인이 만료됐습니다. JSON 백업을 보관하고 다시 로그인하세요.',true);}});
  return loaded;
 }catch{permission(false);mode('서버 연결 실패 · 읽기 전용');info('최신 서버 내용을 불러오지 못했습니다. 배포 파일에 포함된 사례를 표시합니다. 연결 설정 또는 네트워크를 확인하세요.',true);return null;}
})();
