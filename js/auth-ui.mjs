import {takeAuthCallback} from './auth-callback.mjs';
import {PUBLIC_CONFIG} from './public-config.mjs';
import {createAuthController,createRestTransport,validateAuthConfig,developmentDemoAllowed} from './auth.mjs';
const $=id=>document.getElementById(id);
const callback=takeAuthCallback(location.href,history);
const method=PUBLIC_CONFIG.auth?.method??'otp';
const magic=method==='magic-link';
$('auth-intro').textContent=magic?'メール内のログインリンクを開くと、このアプリに戻ります。パスワードは不要です。利用者の記録は端末内のままで、自動同期しません。':'メールに届く6桁のコードで認証します。利用者の記録は端末内のままで、自動同期しません。';
$('auth-send').textContent=magic?'ログインリンクを送信・再送':'認証コードを送信・再送';
let transport=null,configError='';try{if(validateAuthConfig(PUBLIC_CONFIG.auth).enabled)transport=createRestTransport(PUBLIC_CONFIG.auth);}catch(error){configError=error.message;}
let sessionStorageSafe=null;try{sessionStorageSafe=sessionStorage;}catch{}
const auth=createAuthController({transport,storage:sessionStorageSafe});
const labels={'signed-out':'未ログイン',authenticating:'認証中','signed-in':'ログイン済み',error:'認証失敗'};
function render(state){$('auth-state').textContent=labels[state.status];$('auth-status').dataset.state=state.status;$('auth-message').textContent=configError||state.message;$('auth-user').textContent=state.user?.email||'';$('auth-purchase-status').textContent='PLUS購入権限：未確認（購入権限管理は未実装）';const busy=state.status==='authenticating';$('auth-send').disabled=!transport||busy||state.status==='signed-in';$('auth-verify').disabled=!transport||busy||state.status==='signed-in';$('auth-logout').disabled=!transport||state.status==='signed-out';$('auth-code-form').classList.toggle('hidden',magic||state.status==='signed-in');}
auth.subscribe(render);render(auth.getState());
function handleCallback(value){if(!value)return;openAuth();if(transport)auth.acceptCallback(value);else{$('auth-state').textContent='認証失敗';$('auth-message').textContent='ログインリンクを検出しましたが認証設定が未入力または無効です。設定後にリンクを再送してください。';}}
if(callback)handleCallback(callback);else auth.init();
window.addEventListener('hashchange',()=>handleCallback(takeAuthCallback(location.href,history)));
$('auth-email-form').onsubmit=async e=>{e.preventDefault();$('auth-demo-state').value='';$('auth-demo-note').classList.add('hidden');await auth.send($('auth-email').value,$('auth-create-user').checked);};
$('auth-code-form').onsubmit=async e=>{e.preventDefault();const code=$('auth-code').value;$('auth-code').value='';$('auth-demo-state').value='';$('auth-demo-note').classList.add('hidden');await auth.verify($('auth-email').value,code);};
$('auth-logout').onclick=()=>{if(!transport){$('auth-demo-state').value='';$('auth-demo-note').classList.add('hidden');render(auth.getState());return;}auth.logout();$('auth-code').value='';};
function openAuth(){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='auth'));document.querySelectorAll('nav button').forEach(b=>b.removeAttribute('aria-current'));$('auth-heading').focus({preventScroll:true});window.scrollTo(0,0);}
$('open-auth').onclick=openAuth;$('plus-open-auth').onclick=openAuth;$('auth-back').onclick=()=>{document.querySelector('[data-page=settings]').click();$('open-auth').focus({preventScroll:true});window.scrollTo(0,0);};
const demoAllowed=developmentDemoAllowed(PUBLIC_CONFIG,location.hostname)&&!transport&&!configError;$('auth-demo').classList.toggle('hidden',!demoAllowed);
$('auth-demo-state').onchange=()=>{if(!demoAllowed)return;const status=$('auth-demo-state').value;if(!status){$('auth-demo-note').classList.add('hidden');render(auth.getState());return;}$('auth-demo-note').classList.remove('hidden');render({status,user:status==='signed-in'?{email:'sample@example.invalid'}:null,message:status==='error'?'表示テスト：ログインリンク・コードの期限切れや通信失敗の場合です。実際の認証はしていません。':'表示テストです。実際のログイン・メール送信は行いません。'});$('auth-logout').disabled=status!=='signed-in';};
