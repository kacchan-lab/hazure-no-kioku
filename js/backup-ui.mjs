import {DATA_KEYS,JOURNAL_KEY,MAX_BACKUP_BYTES,exportBackup,parseBackup,backupCounts,restoreBackup,recoverRestore} from './backup.mjs';
const $=id=>document.getElementById(id);
export const coordinated=work=>navigator.locks?navigator.locks.request('hazure-no-kioku-restore',work):Promise.resolve().then(work);
export function mountBackup({initial,lock}){
 let candidate=null,expected=null;const tell=text=>$('backup-notice').textContent=text;
 function blocked(message){lock(true);document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='settings'));$('backup-retry').classList.remove('hidden');$('backup-export').disabled=true;$('backup-import').disabled=true;tell(`復元の回復が必要です。ほかの編集は停止しています。${message} 他のタブを閉じ、ブラウザの空き容量を確保してから回復を再試行してください。サイトのデータ削除はしないでください。`);}
 if(initial.status==='blocked')blocked(initial.message);else if(initial.status==='rolled-back')tell('前回の未完了の復元を検出し、元の3領域へ戻しました。');else if(initial.status==='completed')tell('前回の復元完了を確認しました。');
 $('backup-export').onclick=async()=>{try{const data=await coordinated(()=>exportBackup(localStorage));const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hazure-no-kioku-all-v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);tell('FREE・回避額・行動プランを一括で書き出しました。購入権限・認証情報は含みません。');}catch(error){tell(`書き出せませんでした。${error.message} 個別JSONで元の内容を保管してください。`);}};
 $('backup-import').onchange=async()=>{const file=$('backup-import').files[0];$('backup-import').value='';if(!file)return;candidate=null;
  try{if(file.size>MAX_BACKUP_BYTES)throw new Error('ファイルは32MB以内にしてください。');tell('ファイルを検証しています。');await new Promise(resolve=>requestAnimationFrame(resolve));candidate=parseBackup(await file.text());expected=DATA_KEYS.map(key=>localStorage.getItem(key));const counts=backupCounts(candidate);const target=$('backup-summary');target.replaceChildren();
   for(const text of [`FREE：言葉${counts.words}件・衝動${counts.urges}件（成功自己申告${counts.successes}件）・お気に入りと設定`,`回避額：${counts.money}件`,`行動プラン：代替行動${counts.actions}件・自分へのメッセージ${counts.message?'あり':'なし'}`]){const p=document.createElement('p');p.textContent=text;target.append(p);}
   $('backup-tabs-closed').checked=false;$('backup-confirm-ok').disabled=true;$('backup-confirm').showModal();tell('3領域の検証が完了しました。内容を確認してください。');
  }catch(error){tell(`読み込めませんでした。${error instanceof SyntaxError?'正しいJSONファイルを選んでください。':error.message} 元のデータは変更していません。`);}
 };
 $('backup-tabs-closed').onchange=()=>{$('backup-confirm-ok').disabled=!$('backup-tabs-closed').checked;};
 $('backup-confirm-cancel').onclick=()=>{candidate=null;expected=null;$('backup-confirm').close();tell('復元をキャンセルしました。元のデータは変更していません。');};
 $('backup-confirm').addEventListener('cancel',()=>{candidate=null;expected=null;});
 $('backup-confirm-ok').onclick=async()=>{if(!candidate||!$('backup-tabs-closed').checked)return;const value=candidate,before=expected;candidate=null;$('backup-confirm').close();lock(true);tell('復元しています。画面を閉じずにお待ちください。');
  try{await coordinated(()=>{if(DATA_KEYS.some((key,i)=>localStorage.getItem(key)!==before[i]))throw new Error('確認中にデータが変更されました。もう一度ファイルを選んでください。');restoreBackup(localStorage,value);});try{sessionStorage.setItem('hazure-no-kioku-backup-complete','1');}catch{}location.reload();}
  catch(error){let pending=true;try{pending=localStorage.getItem(JOURNAL_KEY)!==null;}catch{}if(pending)blocked(error.message);else{lock(false);tell(error.message);}}
 };
 $('backup-retry').onclick=async()=>{const result=await coordinated(()=>recoverRestore(localStorage));if(result.status==='blocked')blocked(result.message);else location.reload();};
 try{if(sessionStorage.getItem('hazure-no-kioku-backup-complete')==='1'){sessionStorage.removeItem('hazure-no-kioku-backup-complete');tell('一括復元が完了しました。購入権限・デモ状態は復元していません。');}}catch{}
 return {blocked};
}
