const {spawnSync}=require('node:child_process');const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const file of ['browser.cjs','animation.cjs','plus-demo.cjs','analysis-browser.cjs','money-browser.cjs','plan-browser.cjs','backup-browser.cjs','auth-browser.cjs','magic-link-browser.cjs']){
 console.log(`Running ${file}`);
 const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,stdio:'inherit'});
 if(result.error){console.error(result.error.message);process.exit(1);}if(result.status!==0)process.exit(result.status||1);
}
