// Static contract guards only: does not execute PostgreSQL or Stripe billing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('sql/subscription-entitlements.sql');
test('月額価格と解約条件を表示し、旧販売モデルを配信しない',()=>{
 const html=read('index.html');
 assert.match(html,/300<span>円/);assert.match(html,/税込・月額/);
 assert.match(html,/自動更新あり/);assert.match(html,/いつでも解約可能/);
 assert.match(html,/解約予約後は契約期間終了まで/);
 for(const file of ['index.html','README.md','docs/supabase-auth-setup.md','docs/supabase-auth-entitlements-design.md'])assert.doesNotMatch(read(file),/480|買い切り|自動更新なし|月額料金なし/,file);
});
test('権限SQL案は期限付き・本人限定SELECTのみ、内部課金データは非公開',()=>{
 assert.match(sql,/valid_from timestamptz/);assert.match(sql,/valid_until timestamptz/);
 assert.match(sql,/status <> 'active'.*valid_from < valid_until/);
 assert.match(sql,/using \(\(select auth\.uid\(\)\) = user_id\)/);
 assert.match(sql,/grant select on public\.plus_entitlements to authenticated/);
 assert.doesNotMatch(sql,/grant (?:all|insert|update|delete).*to authenticated/i);
 assert.doesNotMatch(sql,/create policy[\s\S]*for (?:insert|update|delete)/i);
 for(const table of ['customers','subscriptions','invoice_periods','webhook_events'])assert.ok(sql.includes(`alter table billing_private.${table} enable row level security;`));
 assert.match(sql,/revoke all on all tables in schema billing_private from public, anon, authenticated/);
});
test('SQL案はイベント一意・返金対応invoice・照合世代とleaseを保持する',()=>{
 assert.match(sql,/event_id text primary key/);assert.match(sql,/stripe_invoice_id text primary key/);
 assert.match(sql,/amount_refunded <= amount_paid/);assert.match(sql,/fully_refunded/);
 assert.match(sql,/reconcile_generation bigint/);assert.match(sql,/reconcile_owner uuid/);assert.match(sql,/reconcile_lease_until timestamptz/);
 assert.match(sql,/not cancel_at_period_end or next_invoice_at is null/);
 assert.doesNotMatch(sql,/\b(?:password|access_token|refresh_token|service_role_key|stripe_secret_key)\s+(?:text|varchar)/i);
});
test('契約変更後も接続設定は無効・空欄、実権限を付与しない',async()=>{
 const {PUBLIC_CONFIG}=await import('../js/public-config.mjs');
 assert.equal(PUBLIC_CONFIG.auth.enabled,false);assert.equal(PUBLIC_CONFIG.auth.projectUrl,'');assert.equal(PUBLIC_CONFIG.auth.publishableKey,'');
 const demo=read('js/plus-demo.mjs');assert.match(demo,/契約確認中（デモ）/);assert.match(demo,/有効な契約中の場合の表示例/);
 assert.match(read('js/auth-ui.mjs'),/PLUS契約権限：未確認/);
});
test('初期SQLは既存オブジェクト・危険な継承を事前拒否し、全体がtransaction',()=>{
 assert.match(sql,/to_regnamespace\('billing_private'\)/);
 assert.doesNotMatch(sql,/create schema if not exists/i);
 assert.match(sql,/pg_has_role\('authenticated','service_role','MEMBER'\)/);
 assert.match(sql,/rolsuper or rolbypassrls/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/\bbegin;[\s\S]*commit;\s*$/i);
});
test('関数はSECURITY INVOKERと空search_path、PUBLICのEXECUTEを剥奪',()=>{
 assert.doesNotMatch(sql,/security definer/i);
 assert.equal((sql.match(/security invoker set search_path = ''/g)||[]).length,2);
 for(const fn of ['billing_private.guard_invoice_update()','public.get_plus_access()'])assert.ok(sql.includes(`revoke all on function ${fn} from public, anon, authenticated;`));
 assert.match(sql,/grant execute on function public\.get_plus_access\(\) to authenticated/);
});
test('利用判定はDB時刻・排他的終了境界・照合鮮度を検査する',()=>{
 assert.match(sql,/pg_catalog.statement_timestamp\(\)/);
 assert.match(sql,/valid_from <= checked_now and checked_now < valid_until/);
 assert.match(sql,/verified_at > checked_now or verified_at < checked_now - interval '5 minutes' then 'error'/);
 assert.match(sql,/checked_now < valid_from then 'not_started'/);
 assert.match(sql,/valid_until is null or isfinite\(valid_until\)/);
});
test('返金巻き戻しと台帳削除を防ぎ、rollbackは空schema限定',()=>{
 assert.match(sql,/new.amount_refunded < old.amount_refunded/);
 assert.match(sql,/old.state in \('fully_refunded','void'\)/);
 assert.match(sql,/revoke delete, truncate on billing_private.invoice_periods from service_role/);
 const rollback=read('sql/subscription-entitlements-rollback.sql');
 assert.match(rollback,/Rollback refused: billing data exists/);
 assert.doesNotMatch(rollback,/drop[^;]*\bcascade\b/i);
 assert.match(rollback,/drop schema billing_private;/);
 assert.match(rollback,/in access exclusive mode/);
});
