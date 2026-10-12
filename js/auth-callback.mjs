export const PKCE_KEY='hazure-no-kioku-pkce-v1';
export const PKCE_MAX_AGE=60*60*1000;
export async function createPkce(cryptoImpl=globalThis.crypto){
 if(!cryptoImpl?.subtle)throw {safeMessage:'このブラウザでは安全なリンク認証を準備できません。HTTPSまたはlocalhostで開いてください。'};
 const bytes=cryptoImpl.getRandomValues(new Uint8Array(32));const verifier=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const hash=new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const challenge=btoa(String.fromCharCode(...hash)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return {verifier,challenge};
}
export function validateRedirect(value,currentHref){
 const current=new URL(currentHref),url=value?new URL(value):new URL(current.origin+current.pathname);
 if(url.origin!==current.origin||url.search||url.hash||url.username||url.password||!['http:','https:'].includes(url.protocol))throw {safeMessage:'戻り先は今開いているアプリと同じoriginの、許可済みURLを指定してください。'};
 if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw {safeMessage:'HTTPでの認証はlocalhostだけで確認してください。'};
 return url.href;
}
export function takeAuthCallback(href,history){
 const url=new URL(href),fragment=new URLSearchParams(url.hash.slice(1));
 const code=url.searchParams.get('code'),error=url.searchParams.get('error_code')||fragment.get('error_code')||url.searchParams.get('error')||fragment.get('error');
 const implicit=fragment.has('access_token')||fragment.has('refresh_token');
 const sensitive=['code','error','error_code','error_description','access_token','refresh_token','token_hash','token_type','expires_in','expires_at'];
 let found=false;for(const key of sensitive){if(url.searchParams.has(key)){url.searchParams.delete(key);found=true;}if(fragment.has(key))found=true;}
 if(fragment.has('error')||fragment.has('error_code')||fragment.has('error_description')||fragment.has('access_token')||fragment.has('refresh_token')||fragment.has('token_hash'))url.hash='';
 if(found)history.replaceState(null,'',url.pathname+url.search+url.hash);
 if(implicit)return {error:'unsupported_callback'};
 if(error)return {error};if(code)return {code};return null;
}
export function loadPkce(storage,projectUrl,now=Date.now()){
 let value;try{value=JSON.parse(storage.getItem(PKCE_KEY));}catch{}
 if(!value||typeof value.verifier!=='string'||!/^[a-f0-9]{64}$/.test(value.verifier)||value.projectUrl!==projectUrl||!Number.isFinite(value.createdAt)||value.createdAt>now||now-value.createdAt>PKCE_MAX_AGE)throw {safeMessage:'送信を始めたブラウザの確認情報がありません。同じブラウザ・同じアプリURLで新しいログインリンクを送信してください。'};
 return value.verifier;
}
