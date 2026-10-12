export const PLAN_KEY='hazure-no-kioku-plan-v1';
export const PLAN_FORMAT='hazure-no-kioku-plan';
export const newPlan=()=>({format:PLAN_FORMAT,version:1,actions:[],message:''});
export function planText(value,max=120,empty=false){if(typeof value!=='string'||value.trim().length>max||(!empty&&!value.trim()))throw new Error(`${empty?'0':'1'}〜${max}文字で入力してください。`);return value.trim();}
export function validatePlan(s){
 if(!s||s.format!==PLAN_FORMAT||s.version!==1||!Array.isArray(s.actions)||s.actions.length>10)throw new Error('行動プランの専用形式または件数が不正です。');
 const ids=new Set();const actions=s.actions.map(a=>{if(!a||typeof a.id!=='string'||!a.id||a.id.length>100||ids.has(a.id))throw new Error('行動IDが不正または重複しています。');ids.add(a.id);return {id:a.id,text:planText(a.text)};});
 return {format:PLAN_FORMAT,version:1,actions,message:planText(s.message,240,true)};
}
export function loadPlan(storage){const raw=storage.getItem(PLAN_KEY);return raw===null?newPlan():validatePlan(JSON.parse(raw));}
export function savePlan(storage,state){storage.setItem(PLAN_KEY,JSON.stringify(validatePlan(state)));}
export function upsertAction(state,text,id=crypto.randomUUID()){const action={id,text:planText(text)};const exists=state.actions.some(a=>a.id===id);return validatePlan({...state,actions:exists?state.actions.map(a=>a.id===id?action:a):[...state.actions,action]});}
export function removeAction(state,id){return validatePlan({...state,actions:state.actions.filter(a=>a.id!==id)});}
export function moveAction(state,id,direction){if(![-1,1].includes(direction))throw new Error('並び替えの指定が不正です。');const actions=[...state.actions],index=actions.findIndex(a=>a.id===id),target=index+direction;if(index<0||target<0||target>=actions.length)return validatePlan(state);[actions[index],actions[target]]=[actions[target],actions[index]];return validatePlan({...state,actions});}
export const PLAN_EXAMPLES=['近くをゆっくり散歩する','落ち着く音楽を聴く','軽いストレッチや運動をする','家族や信頼できる人と話す'];
