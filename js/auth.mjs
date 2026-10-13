import {PKCE_KEY,createPkce,validateRedirect,loadPkce} from './auth-callback.mjs';
export const AUTH_SESSION_KEY='hazure-no-kioku-auth-session-v1';
export function validateAuthConfig(config){
 if(!config?.enabled)return {enabled:false};
 let url;try{url=new URL(config.projectUrl);}catch{throw new Error('Supabase Project URLを設定してください。');}
 if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/'||url.search||url.hash||url.username||url.password||url.port)throw new Error('Project URLはHTTPSのSupabaseプロジェクトURLを指定してください。');
 if(typeof config.publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey))throw new Error('公開用publishable keyのみ設定できます。secret/service_roleキーは使用できません。');
 if(!['otp','magic-link'].includes(config.method??'otp'))throw new Error('認証方式はmagic-linkまたはotpを指定してください。');
 return {enabled:true,url:url.origin,key:config.publishableKey,method:config.method??'otp',redirectUrl:config.redirectUrl??''};
}
export function developmentDemoAllowed(config,hostname){return config?.mode==='development'&&config?.developmentDemo===true&&['localhost','127.0.0.1','[::1]','::1'].includes(hostname);}
export function validateEmail(value){if(typeof value!=='string'||value.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new Error('メールアドレスを確認してください。');return value.trim();}
export function validateOtp(value){if(typeof value!=='string'||!/^\d{6}$/.test(value.trim()))throw new Error('メールに届いた6桁のコードを入力してください。');return value.trim();}
export function authError(error){
 if(error?.code==='otp_expired')return 'ログインリンクまたはコードが期限切れ、または無効です。メールを確認し、新しい認証メールを再送してください。';
 if(['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code))return '送信回数の上限に達しました。少し待ってから再試行してください。';
 if(error?.code==='invalid_credentials'||error?.status===401)return '認証を確認できませんでした。メールアドレス・コードを確認して再試行してください。';
 if(error?.code==='network'||error?.name==='AbortError')return '通信を確認できませんでした。接続を確認して再試行してください。FREE版は引き続き使えます。';
 return error?.safeMessage||'認証に失敗しました。しばらく待って再試行してください。FREE版は引き続き使えます。';
}
export function createRestTransport(config,{fetcher=fetch,timeout=15000,pkceStorage=globalThis.localStorage,currentHref=globalThis.location?.href,cryptoImpl=globalThis.crypto}={}){
 const ready=validateAuthConfig(config);if(!ready.enabled)throw new Error('認証設定はまだ有効ではありません。');
 async function request(path,body,token){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetcher(`${ready.url}/auth/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:ready.key,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store'});
   const data=response.status===204?{}:await response.json();if(!response.ok)throw {code:data.code||data.error_code,status:response.status};return data;
  }catch(error){if(error?.status||error?.code)throw error;throw {code:'network'};}finally{clearTimeout(timer);}
 }
 return {method:ready.method,async sendMagicLink(email,createUser){const redirect=validateRedirect(ready.redirectUrl,currentHref);const {verifier,challenge}=await createPkce(cryptoImpl);if(!pkceStorage)throw {safeMessage:'ブラウザの保存領域を使用できないため、リンクを送信できません。'};try{pkceStorage.setItem(PKCE_KEY,JSON.stringify({verifier,createdAt:Date.now(),projectUrl:ready.url}));}catch{throw {safeMessage:'確認情報を保存できません。ブラウザの保存設定を確認してください。'};}return request(`otp?redirect_to=${encodeURIComponent(redirect)}`,{email,create_user:createUser,code_challenge:challenge,code_challenge_method:'s256'});},async exchangeCode(code){if(typeof code!=='string'||!code||code.length>4096)throw {safeMessage:'ログインリンクを確認できませんでした。再送してください。'};const verifier=loadPkce(pkceStorage,ready.url);try{return await request('token?grant_type=pkce',{auth_code:code,code_verifier:verifier});}finally{try{pkceStorage.removeItem(PKCE_KEY);}catch{}};},sendOtp:(email,createUser)=>request('otp',{email,create_user:createUser}),verifyOtp:(email,token)=>request('verify',{type:'email',email,token}),getUser:token=>request('user',undefined,token),refresh:token=>request('token?grant_type=refresh_token',{refresh_token:token}),logout:token=>request('logout?scope=local',{},token)};
}
export function createAuthController({transport=null,storage=null,now=()=>Date.now()}={}){
 let state={status:'signed-out',user:null,message:transport?'未ログインです。':'認証は未設定です。FREE版はそのまま利用できます。'},session=null,revision=0,expiryTimer=null;const listeners=new Set();
 const emit=next=>{state=next;for(const listener of listeners)listener({...state});};
 const clear=()=>{clearTimeout(expiryTimer);session=null;try{storage?.removeItem(AUTH_SESSION_KEY);}catch{}};
 function sessionData(value){if(typeof value?.access_token!=='string'||!value.access_token||typeof value.refresh_token!=='string'||!value.refresh_token)throw {safeMessage:'認証応答を確認できませんでした。再ログインしてください。'};const expiresAt=value.expires_at?Number(value.expires_at)*1000:now()+Number(value.expires_in)*1000;if(!Number.isFinite(expiresAt))throw {safeMessage:'認証期限を確認できませんでした。'};return {access_token:value.access_token,refresh_token:value.refresh_token,expiresAt};}
 async function signedIn(value,id){const next=sessionData(value),user=await transport.getUser(next.access_token);if(id!==revision)return;if(!user?.id||typeof user.email!=='string')throw {safeMessage:'利用者情報を確認できませんでした。'};session=next;let persisted=true;try{storage?.setItem(AUTH_SESSION_KEY,JSON.stringify(next));}catch{persisted=false;}clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{if(id===revision)emit({status:'error',user:null,message:'認証期限に達しました。再読み込みで認証を更新するか、再ログインしてください。FREE版は引き続き使えます。'});},Math.max(0,Math.min(2147483647,next.expiresAt-now())));expiryTimer?.unref?.();emit({status:'signed-in',user:{id:user.id,email:user.email},message:`ログインしました。PLUS契約権限は未確認です。${persisted?'':'認証状態を保存できないため、再読み込み時は再ログインしてください。'}`});}
 async function operation(work){const id=++revision;emit({status:'authenticating',user:null,message:'認証中です。FREE版は引き続き利用できます。'});try{await work(id);}catch(error){if(id===revision)emit({status:'error',user:null,message:authError(error)});}}
 return {
  getState:()=>({...state}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async acceptCallback(callback){if(!callback||!transport)return;await operation(async id=>{if(callback.error)throw callback.error==='unsupported_callback'?{safeMessage:'このリンクの認証方式には対応していません。新しいログインリンクを送信してください。'}:{code:callback.error};if(transport.method!=='magic-link')throw {safeMessage:'現在はOTP設定です。認証方式を確認してログインをやり直してください。'};await signedIn(await transport.exchangeCode(callback.code),id);});},
  async init(){if(!transport||!storage)return;let raw;try{raw=storage.getItem(AUTH_SESSION_KEY);}catch{return;}if(!raw)return;await operation(async id=>{let saved;try{saved=JSON.parse(raw);}catch{clear();throw {safeMessage:'認証状態を読み込めません。再ログインしてください。'};}if(typeof saved?.access_token!=='string'||typeof saved.refresh_token!=='string'||!Number.isFinite(saved.expiresAt)){clear();throw {safeMessage:'認証状態が不正です。再ログインしてください。'};}if(saved.expiresAt<=now()+30000){const refreshed=await transport.refresh(saved.refresh_token);await signedIn(refreshed,id);}else await signedIn({...saved,expires_at:saved.expiresAt/1000},id);});},
  async send(email,createUser=false){if(!transport)return;await operation(async id=>{const address=validateEmail(email);if(transport.method==='magic-link')await transport.sendMagicLink(address,Boolean(createUser));else await transport.sendOtp(address,Boolean(createUser));if(id===revision)emit({status:'signed-out',user:null,message:transport.method==='magic-link'?'ログインリンクを送信しました。同じブラウザ・同じアプリURLでメール内の最新リンクを開いてください。届かない場合は迷惑メールも確認してください。':'コードを送信しました。メールを確認してください。届かない場合は迷惑メールも確認し、時間をおいて再送してください。'});});},
  async verify(email,code){if(!transport)return;await operation(async id=>{const result=await transport.verifyOtp(validateEmail(email),validateOtp(code));await signedIn(result,id);});},
  async logout(){const token=session?.access_token;const id=++revision;clear();emit({status:'signed-out',user:null,message:'この端末のログイン状態を解除しました。記録は削除していません。'});if(token&&transport)try{await transport.logout(token);}catch(error){if(id===revision)emit({status:'error',user:null,message:'端末内のログイン状態は解除しましたが、サーバーへのログアウト通知を確認できませんでした。通信を確認してください。'});}}
 };
}
