// Disposable local PostgreSQL only: no ports, external network, passwords or remote DB.
const {spawnSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
const name=`hazure-sql-review-${process.pid}-${Date.now()}`;
const image='postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3';
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000});if(r.error)throw r.error;return r;}
function ok(r){if(r.status!==0)throw Error(r.stderr||r.stdout||'docker failed');return r.stdout;}
function query(sql){return docker(['exec','-i',name,'psql','-U','postgres','-X','-v','ON_ERROR_STOP=1','-At'],sql);}
function read(file){return readFileSync(resolve(root,file),'utf8');}
function denied(sql,message){const r=query(sql);if(r.status===0||!r.stderr.includes(message))throw Error(`Expected rejection ${message}: ${r.stderr}`);}
const migration=read('sql/subscription-entitlements.sql');
const rollback=read('sql/subscription-entitlements-rollback.sql');
let started=false;
try{
 ok(docker(['run','--rm','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-d',image]));started=true;
 let ready=false;for(let i=0;i<100;i++){if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}if(!ready)throw Error('Local PostgreSQL startup timeout');
 ok(query(read('tests/sql/local-supabase-fixture.sql')));
 ok(query(migration));ok(query(read('tests/sql/subscription-security.sql')));
 console.log('PASS PostgreSQL: RLS two-user isolation, anon/auth write/DDL/EXECUTE denial, service writes, expiry/cancel/failure/staleness, constraints, refund regression, event uniqueness, test rollback');
 denied(migration,'Existing billing objects');
 ok(query("do $$ begin if (select count(*) from public.plus_entitlements)<>0 then raise exception 'Rerun changed data'; end if; end $$;"));
 console.log('PASS migration rerun: explicit refusal, original schema/data retained');
 ok(query("insert into auth.users(id) values ('00000000-0000-4000-8000-000000000003'); insert into public.plus_entitlements(user_id,product_code,status,payment_state,verified_at) values ('00000000-0000-4000-8000-000000000003','hazure_plus','none','none',now());"));
 denied(rollback,'Rollback refused');
 ok(query("do $$ begin if (select count(*) from public.plus_entitlements)<>1 then raise exception 'Rollback refusal lost data';end if;end $$; delete from public.plus_entitlements; delete from auth.users;"));
 ok(query('create view public.review_dependency as select * from public.plus_entitlements;'));
 denied(rollback,'depend on it');
 ok(query("do $$ begin if to_regprocedure('public.get_plus_access()') is null then raise exception 'Partial rollback committed';end if;end $$;drop view public.review_dependency;"));
 ok(query(rollback));
 ok(query("do $$ begin if to_regnamespace('billing_private') is not null or to_regclass('public.plus_entitlements') is not null then raise exception 'Rollback incomplete';end if;end $$;"));
 console.log('PASS rollback: nonempty/dependent schema rejected atomically; empty schema removed without CASCADE');
 denied(migration.replace('create table public.plus_entitlements (','select 1/0;\ncreate table public.plus_entitlements ('),'division by zero');
 ok(query("do $$ begin if to_regnamespace('billing_private') is not null then raise exception 'Failed apply leaked schema';end if;end $$;"));
 console.log('PASS failed initial apply: all DDL/GRANT rolled back');
 ok(query('create schema billing_private;create table billing_private.review_sentinel(id integer);insert into billing_private.review_sentinel values(7);'));
 denied(migration,'Existing billing objects');
 ok(query("do $$ begin if (select id from billing_private.review_sentinel)<>7 then raise exception 'Existing schema damaged';end if;end $$; drop table billing_private.review_sentinel; drop schema billing_private;"));
 ok(query('grant create on schema public to authenticated;'));denied(migration,'Client roles must not have CREATE');ok(query('revoke create on schema public from authenticated;'));
 ok(query('grant service_role to authenticated;'));denied(migration,'Unsafe client membership');ok(query('revoke service_role from authenticated;'));
 console.log('PASS preflight: existing objects, client CREATE, inherited service_role are rejected');
 ok(query(migration));ok(query(read('tests/sql/subscription-security.sql')));ok(query(rollback));
 console.log('PASS clean reapply and repeat security tests after rollback; no real Supabase/Stripe contacted');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(started){const r=docker(['stop',name]);if(r.status!==0){console.error('Failed to stop own test container');process.exitCode=1;}}}
