import {KEY,loadState,validateState} from './model.mjs';
import {MONEY_KEY,loadMoney,validateMoneyState} from './money.mjs';
import {PLAN_KEY,loadPlan,validatePlan} from './plan.mjs';
export const BACKUP_FORMAT='hazure-no-kioku-user-backup';
export const JOURNAL_KEY='hazure-no-kioku-restore-v1';
export const DATA_KEYS=Object.freeze([KEY,MONEY_KEY,PLAN_KEY]);
export const MAX_BACKUP_BYTES=32*1024*1024;
export function validateBackup(s){
 if(!s||s.format!==BACKUP_FORMAT)throw new Error('一括バックアップ専用のファイルを選んでください。');
 if(s.version!==1)throw new Error('このバックアップのバージョンには対応していません。');
 if(typeof s.exportedAt!=='string'||!Number.isFinite(Date.parse(s.exportedAt))||!s.data||!Object.hasOwn(s.data,'free')||!Object.hasOwn(s.data,'money')||!Object.hasOwn(s.data,'plan'))throw new Error('日時または3領域のデータが不正・不足しています。');
 // Construct a whitelist; never copy arbitrary fields or localStorage entries.
 return {format:BACKUP_FORMAT,version:1,exportedAt:new Date(s.exportedAt).toISOString(),data:{free:validateState(s.data.free),money:validateMoneyState(s.data.money),plan:validatePlan(s.data.plan)}};
}
export function exportBackup(storage,now=new Date()){
 if(storage.getItem(JOURNAL_KEY)!==null)throw new Error('未完了の復元があります。先に回復してください。');
 const value=validateBackup({format:BACKUP_FORMAT,version:1,exportedAt:now.toISOString(),data:{free:loadState(storage),money:loadMoney(storage),plan:loadPlan(storage)}});
 const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw new Error('一括ファイルが32MBを超えます。個別JSONで保管してください。');return value;
}
export function parseBackup(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw new Error('ファイルは32MB以内にしてください。');return validateBackup(JSON.parse(text));}
export function backupCounts(s){return {words:s.data.free.messages.length,urges:s.data.free.records.length,successes:s.data.free.records.filter(r=>r.success).length,money:s.data.money.records.length,actions:s.data.plan.actions.length,message:s.data.plan.message.length>0};}
function validateJournal(j){
 if(!j||j.format!=='hazure-no-kioku-restore-journal'||j.version!==1||!['prepared','committed'].includes(j.phase)||!Array.isArray(j.before)||j.before.length!==3||j.before.some(v=>v!==null&&typeof v!=='string')||!Array.isArray(j.after)||j.after.length!==3||j.after.some(v=>typeof v!=='string'))throw new Error('回復情報が破損しています。自動で上書きしません。');
 const after=validateBackup({format:BACKUP_FORMAT,version:1,exportedAt:'2026-01-01T00:00:00Z',data:{free:JSON.parse(j.after[0]),money:JSON.parse(j.after[1]),plan:JSON.parse(j.after[2])}});
 if(JSON.stringify([after.data.free,after.data.money,after.data.plan].map(s=>JSON.stringify(s)))!==JSON.stringify(j.after))throw new Error('回復情報の新データが不正です。');return j;
}
function restoreBefore(storage,j){
 // Journal is retained until every original key has been restored and verified.
 for(let i=0;i<3;i++){if(storage.getItem(DATA_KEYS[i])===j.before[i])continue;if(j.before[i]===null)storage.removeItem(DATA_KEYS[i]);else storage.setItem(DATA_KEYS[i],j.before[i]);}
 if(DATA_KEYS.some((key,i)=>storage.getItem(key)!==j.before[i]))throw new Error('元データの読み戻しに失敗しました。');storage.removeItem(JOURNAL_KEY);
}
export function recoverRestore(storage){
 let raw;try{raw=storage.getItem(JOURNAL_KEY);if(raw===null)return {status:'clean'};const j=validateJournal(JSON.parse(raw));
  if(j.phase==='committed'&&DATA_KEYS.every((key,i)=>storage.getItem(key)===j.after[i])){storage.removeItem(JOURNAL_KEY);return{status:'completed'};}
  restoreBefore(storage,j);return {status:'rolled-back'};
 }catch(error){return{status:'blocked',message:error.message};}
}
export function restoreBackup(storage,input){
 const clean=validateBackup(input);if(storage.getItem(JOURNAL_KEY)!==null)throw new Error('未完了の復元を先に回復してください。');
 const before=DATA_KEYS.map(key=>storage.getItem(key));const after=[clean.data.free,clean.data.money,clean.data.plan].map(s=>JSON.stringify(s));
 const journal={format:'hazure-no-kioku-restore-journal',version:1,phase:'prepared',before,after};const raw=JSON.stringify(journal);
 // If journal cannot be persisted, do not touch any user data.
 try{storage.setItem(JOURNAL_KEY,raw);}catch(error){throw new Error(`回復情報を保存できません。保存容量やブラウザ設定を確認してください。元データは変更していません。${error.message}`);}if(storage.getItem(JOURNAL_KEY)!==raw)throw new Error('回復情報を保存できませんでした。元データは変更していません。');
 try{
  DATA_KEYS.forEach((key,i)=>storage.setItem(key,after[i]));if(DATA_KEYS.some((key,i)=>storage.getItem(key)!==after[i]))throw new Error('復元データの読み戻しに失敗しました。');
  storage.setItem(JOURNAL_KEY,JSON.stringify({...journal,phase:'committed'}));storage.removeItem(JOURNAL_KEY);return clean;
 }catch(error){try{restoreBefore(storage,journal);throw new Error(`復元に失敗しました。元の3領域に戻しました。${error.message}`);}catch(recoveryError){if(storage.getItem(JOURNAL_KEY)===null)throw recoveryError;throw new Error(`復元・回復が完了していません。編集を停止します。回復情報は保持しています。${error.message}`);}}
}
