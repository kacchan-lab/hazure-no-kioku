import {JOURNAL_KEY,recoverRestore} from './backup.mjs';
import {mountBackup,coordinated} from './backup-ui.mjs';
let locked=false;
function lock(value){locked=value;document.querySelector('nav').inert=value;document.querySelectorAll('.page').forEach(p=>{if(p.id==='settings'){for(const child of p.children)child.inert=value&&child.id!=='unified-backup';}else p.inert=value;});}
// Freeze existing event-driven editors in this tab while recovery is pending.
for(const name of ['click','submit','input','change'])document.addEventListener(name,e=>{if(locked&&!e.target.closest('#unified-backup')){e.preventDefault();e.stopImmediatePropagation();}},true);
const result=await coordinated(()=>recoverRestore(localStorage));
const ui=mountBackup({initial:result,lock});
if(result.status!=='blocked'){await import('./app.mjs');await import('./plus-demo.mjs');await import('./auth-ui.mjs');}
window.addEventListener('storage',e=>{if(e.key===JOURNAL_KEY){if(e.newValue!==null){lock(true);ui.blocked('別のタブで復元が開始されました。');}else if(locked)location.reload();}else if(locked){e.stopImmediatePropagation();}},true);

document.querySelector('main').inert=false;document.documentElement.dataset.appReady=result.status==='blocked'?'blocked':'ready';
