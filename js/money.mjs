import {localDateKey} from './analysis.mjs';
export const MONEY_KEY='hazure-no-kioku-money-v1';
export const MONEY_FORMAT='hazure-no-kioku-money';
export const MAX_AMOUNT=1_000_000, MAX_TOTAL=100_000_000, MAX_RECORDS=5000;
export const newMoneyState=()=>({format:MONEY_FORMAT,version:1,records:[]});
export function parseAmount(value,max=MAX_AMOUNT){
 if(typeof value==='string'){if(!/^\d+$/.test(value.trim()))throw new Error('金額は0以上の整数で入力してください。');value=Number(value.trim());}
 if(!Number.isSafeInteger(value)||value<0||value>max)throw new Error(`金額は0〜${max.toLocaleString('ja-JP')}円の整数で入力してください。`);
 return value;
}
export function validateDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01')throw new Error('日付は1900年以降の実在する日付を入力してください。');
 const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('実在する日付を入力してください。');return value;
}
export function validateMemo(value){if(typeof value!=='string'||value.trim().length>120)throw new Error('メモは120文字以内で入力してください。');return value.trim();}
export function validateMoneyState(s){
 if(!s||s.format!==MONEY_FORMAT||s.version!==1||!Array.isArray(s.records)||s.records.length>MAX_RECORDS)throw new Error('回避額のバックアップ形式が不正です。');
 const ids=new Set();let total=0;
 const records=s.records.map(r=>{if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id))throw new Error('記録IDが不正または重複しています。');ids.add(r.id);const amount=parseAmount(r.amount);total+=amount;return {id:r.id,date:validateDate(r.date),amount,memo:validateMemo(r.memo)};});
 if(total>MAX_TOTAL)throw new Error('回避額の合計は1億円以内で入力してください。');return {format:MONEY_FORMAT,version:1,records};
}
export function loadMoney(storage){const raw=storage.getItem(MONEY_KEY);return raw===null?newMoneyState():validateMoneyState(JSON.parse(raw));}
export function saveMoney(storage,state){storage.setItem(MONEY_KEY,JSON.stringify(validateMoneyState(state)));}
export function upsertMoney(state,entry,id=crypto.randomUUID(),today=localDateKey(new Date())){
 const date=validateDate(entry.date);if(date>today)throw new Error('入力日は今日以前にしてください。');
 const record={id,date,amount:parseAmount(entry.amount),memo:validateMemo(entry.memo)};
 const exists=state.records.some(r=>r.id===id);
 const records=exists?state.records.map(r=>r.id===id?record:r):[...state.records,record];
 return validateMoneyState({...newMoneyState(),records});
}
export function deleteMoney(state,id){return validateMoneyState({...newMoneyState(),records:state.records.filter(r=>r.id!==id)});}
export function summarizeMoney(state,now=new Date()){
 const month=localDateKey(now).slice(0,7);const monthly=new Map();let total=0,current=0;
 for(const r of state.records){total+=r.amount;if(r.date.slice(0,7)===month)current+=r.amount;const key=r.date.slice(0,7);monthly.set(key,(monthly.get(key)||0)+r.amount);}
 const chart=[];for(let i=11;i>=0;i--){const date=new Date(now.getFullYear(),now.getMonth()-i,1);const key=localDateKey(date).slice(0,7);chart.push({month:key,amount:monthly.get(key)||0});}
 return {total,current,count:state.records.length,chart};
}
export function simulate({mode,amount,annualRate,years}){
 if(!['lump','monthly'].includes(mode))throw new Error('試算方法が不正です。');
 amount=parseAmount(amount,mode==='lump'?MAX_TOTAL:MAX_AMOUNT);
 if(typeof annualRate!=='number'||!Number.isFinite(annualRate)||annualRate<0||annualRate>10)throw new Error('年利は0〜10%で入力してください。');
 if(!Number.isInteger(years)||years<1||years>30)throw new Error('期間は1〜30年で入力してください。');
 const months=years*12,rate=annualRate/100;
 const principal=mode==='lump'?amount:amount*months;
 // Annual effective return converted to an equivalent monthly rate. End-of-month deposits.
 const monthlyRate=Math.expm1(Math.log1p(rate)/12);
 const value=mode==='lump'?amount*Math.pow(1+rate,years):rate===0?principal:amount*Math.expm1(months*Math.log1p(monthlyRate))/monthlyRate;
 if(!Number.isFinite(value))throw new Error('試算結果が大きすぎます。');
 return {principal,value,gain:Math.max(0,value-principal)};
}
