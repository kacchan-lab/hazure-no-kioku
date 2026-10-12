import { INITIAL_MESSAGES } from './messages.mjs';
export const KEY = 'hazure-no-kioku-v1';
export const newState = () => ({version:1,messages:INITIAL_MESSAGES.map(m=>({...m})),favorites:[],records:[],settings:{animation:true},lastMessageId:null});
export function validText(value) {
 if(typeof value!=='string' || !value.trim() || value.trim().length>120) throw new Error('言葉は1〜120文字で入力してください。');
 return value.trim();
}
export function validIntensity(value) {
 if(!Number.isInteger(value) || value<0 || value>10) throw new Error('気持ちの強さは0〜10の整数で入力してください。');
 return value;
}
export function validateState(s) {
 if(!s || s.version!==1 || !Array.isArray(s.messages) || !s.messages.length || s.messages.length>1000 || !Array.isArray(s.records) || s.records.length>100000 || !Array.isArray(s.favorites) || typeof s.settings?.animation!=='boolean') throw new Error('対応していないデータ形式です。');
 const ids=new Set();
 const messages=s.messages.map(m=>{
  if(typeof m.id!=='string'||!m.id||m.id.length>100||ids.has(m.id)||!['personal','wisdom'].includes(m.kind)||typeof m.custom!=='boolean') throw new Error('言葉のデータが不正です。');
  ids.add(m.id);return {id:m.id,text:validText(m.text),kind:m.kind,custom:m.custom};
 });
 if(s.favorites.some(id=>!ids.has(id))||new Set(s.favorites).size!==s.favorites.length||!(s.lastMessageId===null||ids.has(s.lastMessageId))) throw new Error('言葉の参照が不正です。');
 const recordIds=new Set();
 const records=s.records.map(r=>{
  if(typeof r.id!=='string'||!r.id||r.id.length>100||recordIds.has(r.id)||typeof r.at!=='string'||!Number.isFinite(Date.parse(r.at))||typeof r.success!=='boolean') throw new Error('記録のデータが不正です。');
  recordIds.add(r.id);return {id:r.id,at:new Date(r.at).toISOString(),intensity:validIntensity(r.intensity),success:r.success};
 });
 return {version:1,messages,favorites:[...s.favorites],records,settings:{animation:s.settings.animation},lastMessageId:s.lastMessageId};
}
export function saveState(storage,state) {storage.setItem(KEY,JSON.stringify(validateState(state)));}
export function loadState(storage) {const raw=storage.getItem(KEY);return raw===null?newState():validateState(JSON.parse(raw));}
export function recordUrge(s,intensity,id=crypto.randomUUID(),at=new Date().toISOString()) {
 validIntensity(intensity);const r={id,at,intensity,success:false};s.records.push(r);return r;
}
export function markSuccess(s,id) {const r=s.records.find(r=>r.id===id);if(!r||r.success)return false;r.success=true;return true;}
export function deleteMessage(s,id) {
 s.messages=s.messages.filter(m=>m.id!==id);s.favorites=s.favorites.filter(x=>x!==id);if(s.lastMessageId===id)s.lastMessageId=null;
}
