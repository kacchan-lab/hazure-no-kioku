// Read-only pre-commit check. Never prints configuration values.
import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
const working=process.argv.includes('--working-tree');let source;
try{source=working?readFileSync(new URL('../js/public-config.mjs',import.meta.url),'utf8'):execFileSync('git',['show',':js/public-config.mjs'],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','ignore']}).toString();}catch{console.error('確認対象の設定ファイルがありません。未ステージなら --working-tree で確認してください。');process.exit(1);}
const value=name=>source.match(new RegExp(`${name}\\s*:\\s*(['"])(.*?)\\1`))?.[2];
const url=value('projectUrl'),key=value('publishableKey');
if(url===undefined||key===undefined){console.error('設定形式を確認できません。設定値は表示しません。');process.exit(1);}
if(url||key||/enabled\s*:\s*true/.test(source)||/sb_secret_[A-Za-z0-9_-]+/.test(source)||/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(source)){console.error('公開を止めてください。接続設定またはキーが残っています。値を空欄・enabled:falseに戻して再確認してください。');process.exit(1);}
console.log(`PASS: ${working?'作業ファイル':'ステージ済みファイル'}のURL・キーは空欄、接続は無効です。`);
