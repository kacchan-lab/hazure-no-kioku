import {chooseMessage} from './messages.mjs';
import {KEY,newState,loadState,saveState,validateState,validText,recordUrge,markSuccess,deleteMessage} from './model.mjs';
const $=id=>document.getElementById(id);
let state, currentRecord=null,currentMessage=null,editing=null,timer=null,confirmation=null,phaseTimers=[],animationRun=0;
try{state=loadState(localStorage)}catch{state=newState();$('notice').textContent='保存データを読み込めませんでした。元のデータは上書きしていません。必要なら設定からバックアップしてください。';}
function notify(text){$('notice').textContent=text;}
function commit(next){try{saveState(localStorage,next);state=next;return true}catch{notify('保存できませんでした。ブラウザの保存設定や空き容量を確認してください。操作は反映していません。');return false}}
const clone=()=>structuredClone(state);
function confirmAction(title,text,action){confirmation=action;$('confirm-title').textContent=title;$('confirm-text').textContent=text;$('confirm-dialog').showModal();}
$('confirm-cancel').onclick=()=>{$('confirm-dialog').close();confirmation=null};
$('confirm-ok').onclick=()=>{const action=confirmation;confirmation=null;$('confirm-dialog').close();action?.()};
$('confirm-dialog').addEventListener('cancel',()=>{confirmation=null});
function switchPage(page){if(timer)finishAnimation({focus:false});document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==page));document.querySelectorAll('nav button').forEach(b=>{if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});render();}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
document.querySelector('.brand').onclick=e=>{e.preventDefault();switchPage('home')};
$('intensity').oninput=()=>{$('intensity-value').textContent=$('intensity').value};
function stopAnimationTimers(){animationRun++;clearTimeout(timer);timer=null;phaseTimers.forEach(clearTimeout);phaseTimers=[];}
function setAnimationCaption(caption){$('animation').dataset.caption=caption;$('animation-announcement').textContent=document.querySelector(`#animation [data-line="${caption}"]`).textContent;}
function setAnimationPhase(phase,caption){$('animation').dataset.phase=phase;if(caption)setAnimationCaption(caption);}
function finishAnimation({focus=true}={}){stopAnimationTimers();if(!currentMessage)return;document.querySelectorAll('#animation .tiles>span').forEach(slot=>slot.dataset.state='landed');$('animation').classList.add('hidden');$('result').classList.remove('hidden');$('urge').disabled=false;$('message').textContent=currentMessage.text;$('message-kind').textContent=kindLabel(currentMessage);renderFavorite();$('success').disabled=false;$('success').textContent='今日は打たずに済んだ';if(focus&&!$('home').classList.contains('hidden'))$('result').focus();}
$('urge').onclick=()=>{
 if(timer||$('urge').disabled)return;
 const next=clone();const message=chooseMessage(next.messages,next.lastMessageId);const record=recordUrge(next,Number($('intensity').value));next.lastMessageId=message.id;
 if(!commit(next))return;currentMessage=message;currentRecord=record.id;$('result').classList.add('hidden');
 if(state.settings.animation&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  stopAnimationTimers();const run=animationRun;const slots=[...document.querySelectorAll('#animation .tiles>span')];slots.forEach(slot=>slot.dataset.state='waiting');
  const later=(delay,action)=>setTimeout(()=>{if(run===animationRun)action();},delay);
  const drop=(index,phase)=>{slots[index].dataset.state='falling';setAnimationPhase(phase);};
  $('urge').disabled=true;setAnimationCaption('first');drop(0,'left');$('animation').classList.remove('hidden');$('animation').scrollIntoView({block:'center'});
  phaseTimers=[later(1500,()=>slots[0].dataset.state='landed'),later(1800,()=>drop(2,'right')),later(3300,()=>{slots[2].dataset.state='landed';setAnimationCaption('second');}),later(3600,()=>drop(1,'center')),later(5100,()=>{slots[1].dataset.state='landed';setAnimationPhase('miss','miss');})];
  timer=later(6000,finishAnimation);
 }else finishAnimation();
};
$('skip').onclick=finishAnimation;
// Other modules can switch pages too; finish without moving focus from that page.
new MutationObserver(()=>{if($('home').classList.contains('hidden')&&timer)finishAnimation({focus:false});}).observe($('home'),{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&timer)finishAnimation({focus:false});});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches&&timer)finishAnimation();});
function kindLabel(m){return m.kind==='personal'?'自分の過去の言葉':'オリジナルの禁パチ格言';}
function renderFavorite(){if(!currentMessage)return;const on=state.favorites.includes(currentMessage.id);$('favorite').textContent=on?'★ お気に入り登録済み':'☆ お気に入りに登録';$('favorite').setAttribute('aria-pressed',String(on));}
function toggleFavorite(id){const next=clone();next.favorites=next.favorites.includes(id)?next.favorites.filter(x=>x!==id):[...next.favorites,id];if(commit(next))render();}
$('favorite').onclick=()=>toggleFavorite(currentMessage.id);
$('success').onclick=()=>{const next=clone();if(!markSuccess(next,currentRecord))return;if(commit(next)){$('success').disabled=true;$('success').textContent='この衝動をやり過ごしたと記録しました';notify('自己申告を記録しました。同じ衝動では重複して数えません。');render();}};
function wordNode(m,tools=true){const node=document.createElement('div');node.className='word-item';const badge=document.createElement('span');badge.className='badge';badge.textContent=kindLabel(m);const text=document.createElement('p');text.className='word-text';text.textContent=m.text;node.append(badge,text);
 if(tools){const bar=document.createElement('div');bar.className='word-tools';const favorite=document.createElement('button');const on=state.favorites.includes(m.id);favorite.textContent=on?'★ お気に入り':'☆ お気に入り';favorite.setAttribute('aria-pressed',String(on));favorite.onclick=()=>toggleFavorite(m.id);bar.append(favorite);
 if(m.kind==='personal'){const edit=document.createElement('button');edit.textContent='編集';edit.onclick=()=>{editing=m.id;$('word-input').value=m.text;$('word-submit').textContent='編集を保存';$('cancel-edit').classList.remove('hidden');$('word-input').focus()};const del=document.createElement('button');del.textContent='削除';del.onclick=()=>confirmAction('言葉を削除','この言葉を削除しますか？',()=>{const next=clone();deleteMessage(next,m.id);if(commit(next)){if(editing===m.id)resetForm();if(currentMessage?.id===m.id){currentMessage=null;$('result').classList.add('hidden')}render()}});bar.append(edit,del)}node.append(bar)}return node;}
function resetForm(){editing=null;$('word-form').reset();$('word-submit').textContent='言葉を追加';$('cancel-edit').classList.add('hidden');}
$('cancel-edit').onclick=resetForm;
$('word-form').onsubmit=e=>{e.preventDefault();try{const text=validText($('word-input').value);const next=clone();if(editing){const m=next.messages.find(m=>m.id===editing);if(!m)throw new Error('編集対象が見つかりません。');m.text=text}else{if(next.messages.length>=1000)throw new Error('言葉は最大1000個までです。');next.messages.push({id:crypto.randomUUID(),text,kind:'personal',custom:true})}if(commit(next)){resetForm();render();notify('言葉を保存しました。')}}catch(error){notify(error.message)}};
$('favorites-only').onchange=render;
function render(){
 $('animation-setting').checked=state.settings.animation;$('total').textContent=state.records.length;$('successful').textContent=state.records.filter(r=>r.success).length;renderFavorite();
 $('word-list').replaceChildren(...state.messages.filter(m=>!$('favorites-only').checked||state.favorites.includes(m.id)).map(m=>wordNode(m)));if(!$('word-list').childElementCount)$('word-list').textContent='お気に入りはまだありません。';
 $('past-words').replaceChildren(...state.messages.filter(m=>m.kind==='personal').map(m=>wordNode(m,false)));if(!$('past-words').childElementCount)$('past-words').textContent='自分の言葉はまだありません。';
 const records=$('records');records.replaceChildren();const groups=new Map();for(const r of [...state.records].reverse()){const key=new Date(r.at).toLocaleDateString('ja-JP');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
 for(const [date,items] of groups){const title=document.createElement('h3');title.textContent=date;records.append(title);for(const r of items){const node=document.createElement('div');node.className='record-item';const p=document.createElement('p');p.textContent=`${new Date(r.at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})} · 気持ち ${r.intensity} / 10`;const status=document.createElement('p');status.textContent=r.success?'やり過ごした（自己申告）':'衝動の記録 · 成功の申告なし';node.append(p,status);records.append(node)}}if(!state.records.length)records.textContent='まだ記録はありません。立ち止まった時間が、ここに残ります。';
}
$('animation-setting').onchange=()=>{const next=clone();next.settings.animation=$('animation-setting').checked;if(commit(next)){notify('演出設定を保存しました。');if(!state.settings.animation&&timer)finishAnimation();}render()};
$('export').onclick=()=>{try{const raw=localStorage.getItem(KEY);const contents=raw??JSON.stringify(state);const url=URL.createObjectURL(new Blob([contents],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hazure-no-kioku.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSONを書き出しました。ファイルを安全に保管してください。')}catch{notify('データを書き出せませんでした。')}};
$('import').onchange=async()=>{const file=$('import').files[0];$('import').value='';if(!file)return;try{if(file.size>5*1024*1024)throw new Error('ファイルは5MB以内にしてください。');const data=validateState(JSON.parse(await file.text()));confirmAction('データを置き換える','現在の記録・言葉・設定を読み込んだデータで置き換えます。続けますか？',()=>{if(commit(data)){clearCurrent();resetForm();render();notify('データを読み込みました。')}})}catch(error){notify(`読み込めませんでした。${error instanceof SyntaxError?'正しいJSONファイルを選んでください。':error.message}`)}};
function clearCurrent(){stopAnimationTimers();currentRecord=null;currentMessage=null;$('result').classList.add('hidden');$('animation').classList.add('hidden');$('urge').disabled=false;}
$('delete-all').onclick=()=>confirmAction('全データを削除','すべての記録・お気に入り・設定・追加や編集した言葉を削除します。元に戻せません。',()=>{try{localStorage.removeItem(KEY);state=newState();clearCurrent();resetForm();$('favorites-only').checked=false;$('intensity').value='5';$('intensity-value').textContent='5';render();notify('全データを削除し、初期状態に戻しました。')}catch{notify('削除できませんでした。ブラウザの設定を確認してください。')}});
window.addEventListener('storage',e=>{if(e.key!==KEY)return;try{state=loadState(localStorage);clearCurrent();resetForm();render();notify('別のタブで変更されたデータを反映しました。')}catch{notify('別のタブのデータを読み込めませんでした。')}});
render();
