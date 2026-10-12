import {PLAN_KEY,loadPlan,savePlan,validatePlan,upsertAction,removeAction,moveAction,planText,PLAN_EXAMPLES} from './plan.mjs';
const node=(name,text,cls)=>{const n=document.createElement(name);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function mountPlan({container,access,storage=localStorage}){
 const $=id=>document.getElementById(id);let editing=null,sequence=0,readError=false,messageDirty=false;
 const allowed=async()=>{try{return Boolean((await access.getAccess())?.allowed)}catch{return false;}};
 const tell=text=>$('plan-notice').textContent=text;
 function resetAction(){editing=null;$('plan-action-form').reset();$('plan-action-submit').textContent='代替行動を追加';$('plan-action-cancel').classList.add('hidden');}
 async function write(make){if(!await allowed()){tell('編集には開発用PLUSデモを選択してください。');return false;}try{if(readError)throw new Error('読み込めない保存データは上書きしません。専用JSONを確認してください。');savePlan(storage,make(loadPlan(storage)));await render();return true;}catch(error){tell(`保存できませんでした。${error.message}`);return false;}}
 async function render(){const id=++sequence;const can=await allowed();if(id!==sequence)return;container.classList.toggle('hidden',!can);$('plan-quick').classList.toggle('hidden',!can);if(!can){resetAction();$('plan-message-form').reset();messageDirty=false;$('plan-actions').replaceChildren();$('plan-dialog-content').replaceChildren();if($('plan-dialog').open)$('plan-dialog').close();return;}
  let state;try{state=loadPlan(storage);readError=false;}catch{readError=true;$('plan-actions').replaceChildren(node('p','行動プランを読み込めませんでした。元のデータを上書きせず、専用JSONで退避できます。','plan-error'));$('plan-action-submit').disabled=true;$('plan-message').value='';return;}
  $('plan-count').textContent=`${state.actions.length} / 10件`;$('plan-action-submit').disabled=state.actions.length===10&&!editing;if(!messageDirty)$('plan-message').value=state.message;
  const list=$('plan-actions');list.replaceChildren();
  if(!state.actions.length){list.append(node('p','まだ代替行動は登録されていません。例から自分に合うものを考えてみてください。','quiet'));const examples=node('ul');for(const text of PLAN_EXAMPLES)examples.append(node('li',text));list.append(examples);}
  state.actions.forEach((action,index)=>{const row=node('div',undefined,'word-item');row.append(node('p',`${index+1}. ${action.text}`,'word-text'));const tools=node('div',undefined,'word-tools');
   const addButton=(label,handler,disabled=false)=>{const b=node('button',label);b.type='button';b.disabled=disabled;b.setAttribute('aria-label',`${action.text}：${label}`);b.onclick=handler;tools.append(b);};
   addButton('編集',async()=>{if(!await allowed())return;editing=action.id;$('plan-action-input').value=action.text;$('plan-action-submit').textContent='編集を保存';$('plan-action-submit').disabled=false;$('plan-action-cancel').classList.remove('hidden');$('plan-action-input').focus();});
   addButton('削除',async()=>{if(!await allowed()||!window.confirm('この代替行動を削除しますか？'))return;if(await write(s=>removeAction(s,action.id))){if(editing===action.id)resetAction();await render();tell('代替行動を削除しました。');}});
   addButton('↑ 上へ',async()=>{if(await write(s=>moveAction(s,action.id,-1)))tell('順番を変更しました。');},index===0);
   addButton('↓ 下へ',async()=>{if(await write(s=>moveAction(s,action.id,1)))tell('順番を変更しました。');},index===state.actions.length-1);row.append(tools);list.append(row);
  });
 }
 $('plan-action-form').onsubmit=async e=>{e.preventDefault();const text=$('plan-action-input').value,id=editing||crypto.randomUUID();if(await write(s=>{if(editing&&!s.actions.some(a=>a.id===id))throw new Error('編集対象が別のタブで削除されました。');return upsertAction(s,text,id);})){resetAction();await render();tell('代替行動を保存しました。');}};
 $('plan-action-cancel').onclick=()=>{resetAction();render();};
 $('plan-message').addEventListener('input',()=>{messageDirty=true;});
 $('plan-message-form').onsubmit=async e=>{e.preventDefault();const message=$('plan-message').value;if(await write(s=>validatePlan({...s,message:planText(message,240,true)}))){if($('plan-message').value===message){messageDirty=false;$('plan-message').value=planText(message,240,true);}tell('自分へのメッセージを保存しました。');}};
 async function showPlan(){if(!await allowed())return;const content=$('plan-dialog-content');content.replaceChildren();let state;try{state=loadPlan(storage);}catch{tell('プランを読み込めないため表示できません。元の保存内容は変更していません。');return;}
  content.append(node('p','10分は目安です。衝動が必ず収まる効果は保証しません。いつでも閉じて、別の行動を選んで大丈夫です。','quiet'),node('h3','最初の1分：いったん立ち止まる'),node('p','安全な場所へ離れ、呼吸を整える。'));
  content.append(node('h3','次の8分：この中から一つ選ぶ'));const list=node('ul');for(const a of state.actions.length?state.actions:PLAN_EXAMPLES.map(text=>({text})))list.append(node('li',a.text));content.append(list);
  if(!state.actions.length)content.append(node('p','未登録のため例を表示しています。自動保存はしません。','quiet'));
  content.append(node('h3','最後の1分：今の気持ちを確認する'),node('p','続ける・休む・信頼できる人に連絡するなど、次の一歩を選ぶ。'),node('h3','自分へのメッセージ'),node('p',state.message||'今すぐ決めなくても大丈夫。自分のための一歩を選ぼう。','plan-personal-message'));
  if(!await allowed())return;$('plan-dialog').showModal();$('plan-dialog-close').focus();
 }
 $('plan-show').onclick=showPlan;$('plan-quick').onclick=showPlan;$('plan-dialog-close').onclick=()=>$('plan-dialog').close();
 $('plan-export').onclick=async()=>{if(!await allowed())return;try{const raw=storage.getItem(PLAN_KEY)??JSON.stringify(loadPlan(storage));const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=node('a');a.href=url;a.download='hazure-no-kioku-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);tell('行動プラン専用JSONを書き出しました。');}catch{tell('書き出せませんでした。');}};
 $('plan-import').onchange=async()=>{const file=$('plan-import').files[0];$('plan-import').value='';if(!file||!await allowed())return;try{if(file.size>100*1024)throw new Error('ファイルは100KB以内にしてください。');const next=validatePlan(JSON.parse(await file.text()));if(!await allowed()||!window.confirm('行動プランだけを置き換えます。先に専用JSONを保存してください。続けますか？'))return;savePlan(storage,next);messageDirty=false;resetAction();await render();tell('行動プランを読み込みました。無料版・回避額のデータは変更していません。');}catch(error){tell(`読み込めませんでした。${error.message}`);}};
 $('plan-delete-all').onclick=async()=>{if(!await allowed()||!window.confirm('行動プランと自分へのメッセージをすべて削除します。元に戻せません。'))return;try{storage.removeItem(PLAN_KEY);messageDirty=false;resetAction();await render();tell('行動プランだけを削除しました。');}catch{tell('削除できませんでした。');}};
 access.subscribe(render);window.addEventListener('storage',e=>{if(e.key===PLAN_KEY||e.key===null){messageDirty=false;resetAction();render();}});render();return{refresh:render};
}
