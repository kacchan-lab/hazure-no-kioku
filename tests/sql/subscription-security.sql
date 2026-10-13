-- Admin-only, DISPOSABLE test project. All fixtures rolled back.
-- Two fixture users have no real email/password and no Auth login capability.
begin;
do $$ begin
 if exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'))
    or exists(select 1 from public.plus_entitlements)
    or exists(select 1 from billing_private.customers) then
   raise exception 'Use an empty disposable test database; fixtures must not overwrite data';
 end if;
end $$;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
set local role service_role;
insert into billing_private.customers(user_id,stripe_customer_id,livemode)
 values ('00000000-0000-4000-8000-000000000001','cus_REVIEW_ONLY_A',false);
insert into billing_private.subscriptions(stripe_subscription_id,user_id,product_code,stripe_price_id,status)
 values ('sub_REVIEW_ONLY','00000000-0000-4000-8000-000000000001','hazure_plus','price_REVIEW_ONLY','active');
insert into billing_private.invoice_periods(stripe_invoice_id,stripe_subscription_id,period_start,period_end,amount_paid,currency,state)
 values ('in_REVIEW_ONLY','sub_REVIEW_ONLY',now()-interval '1 day',now()+interval '1 day',300,'jpy','paid');
insert into public.plus_entitlements(user_id,product_code,status,valid_from,valid_until,payment_state,verified_at)
 values ('00000000-0000-4000-8000-000000000001','hazure_plus','active',now()-interval '1 day',now()+interval '1 day','paid',now()),
 ('00000000-0000-4000-8000-000000000002','hazure_plus','none',null,null,'none',now());
reset role;
do $$ begin
 if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='billing_private' or (n.nspname='public' and p.proname='get_plus_access'))
     and (p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'],false))) then
   raise exception 'Unsafe function security/search_path';
 end if;
 if has_function_privilege('anon','public.get_plus_access()','EXECUTE')
    or has_function_privilege('authenticated','billing_private.guard_invoice_update()','EXECUTE')
    or has_table_privilege('service_role','billing_private.invoice_periods','DELETE') then
   raise exception 'Unexpected function/ledger privilege';
 end if;
end $$;
set local role anon;
do $$ declare q text; begin
 foreach q in array array[
  'select * from public.plus_entitlements',
  'insert into public.plus_entitlements default values',
  'update public.plus_entitlements set status=''active'' where false',
  'delete from public.plus_entitlements where false',
  'truncate public.plus_entitlements',
  'select * from public.get_plus_access()',
  'select * from billing_private.customers',
  'insert into billing_private.webhook_events default values'
 ] loop
  begin execute q; raise exception 'Unexpected anon permission: %',q;
  exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare q text; begin
 if (select count(*) from public.plus_entitlements) <> 1 then raise exception 'RLS own row failed'; end if;
 if exists(select 1 from public.plus_entitlements where user_id='00000000-0000-4000-8000-000000000002') then raise exception 'Other user leaked'; end if;
 if not (select allowed from public.get_plus_access()) then raise exception 'Active access rejected'; end if;
 foreach q in array array[
  'insert into public.plus_entitlements default values',
  'update public.plus_entitlements set status=''active''',
  'delete from public.plus_entitlements',
  'truncate public.plus_entitlements',
  'select * from billing_private.customers',
  'select * from billing_private.subscriptions',
  'select * from billing_private.invoice_periods',
  'select * from billing_private.webhook_events',
  'insert into billing_private.customers default values',
  'update billing_private.subscriptions set status=''active''',
  'delete from billing_private.invoice_periods',
  'insert into billing_private.webhook_events default values',
  'select billing_private.guard_invoice_update()',
  'create table public.review_attack(id integer)'
 ] loop
  begin execute q; raise exception 'Unexpected authenticated permission: %',q;
  exception when insufficient_privilege then null; end;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.plus_entitlements) <> 1 or (select allowed from public.get_plus_access()) then raise exception 'User B isolation failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from public.plus_entitlements) or (select verification_status from public.get_plus_access()) <> 'unknown' then raise exception 'Missing JWT not blocked'; end if;
end $$;
reset role;
-- Admin updates fixtures to simulate trusted reconciler output, not user writes.
-- Test helper is temporary, SECURITY INVOKER; no production function is changed.
create function pg_temp.assert_access(expected text, permit boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare v record; begin
 select * into v from public.get_plus_access();
 if v.verification_status <> expected or v.allowed is distinct from permit then
   raise exception 'Expected % / %, got % / %',expected,permit,v.verification_status,v.allowed;
 end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.plus_entitlements set cancel_at_period_end=true, next_invoice_at=null;
set local role authenticated;
select pg_temp.assert_access('active',true); -- Scheduled cancel retains paid period.
reset role;
update public.plus_entitlements set payment_state='failed' where status='active';
set local role authenticated;
select pg_temp.assert_access('active',true); -- Retry failure does not erase a paid period.
reset role;
update public.plus_entitlements set valid_until=statement_timestamp() where status='active';
set local role authenticated;
select pg_temp.assert_access('expired',false); -- End is exclusive even if raw status is active.
reset role;
update public.plus_entitlements set valid_from=now()+interval '1 day',valid_until=now()+interval '2 days' where status='active';
set local role authenticated;
select pg_temp.assert_access('not_started',false);
reset role;
update public.plus_entitlements set status='suspended',payment_state='refunded' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_access('suspended',false);
reset role;
update public.plus_entitlements set verified_at=now()-interval '6 minutes';
set local role authenticated;
select pg_temp.assert_access('error',false); -- Not "none" on stale data.
reset role;
update public.plus_entitlements set verified_at=now()+interval '1 day';
set local role authenticated;
select pg_temp.assert_access('error',false);
reset role;
do $$ begin
 begin update public.plus_entitlements set status='active',valid_from=now(),valid_until='infinity',payment_state='paid';
   raise exception 'Infinity accepted'; exception when check_violation then null; end;
 begin update public.plus_entitlements set status='active',valid_from=now(),valid_until=now()+interval '1 day',payment_state='refunded';
   raise exception 'Active refund accepted'; exception when check_violation then null; end;
 begin update billing_private.subscriptions set current_period_end=now();
   raise exception 'Half-null period accepted'; exception when check_violation then null; end;
 begin update billing_private.invoice_periods set state='fully_refunded';
   raise exception 'Inconsistent refund accepted'; exception when check_violation then null; end;
end $$;
set local role service_role;
do $$ begin
 begin delete from billing_private.invoice_periods;
   raise exception 'Worker erased invoice ledger'; exception when insufficient_privilege then null; end;
end $$;
update billing_private.invoice_periods set amount_refunded=100;
do $$ begin
 begin update billing_private.invoice_periods set amount_refunded=0;
   raise check_violation using message='Refund regression accepted';
 exception when raise_exception then null; end;
end $$;
update billing_private.invoice_periods set amount_refunded=300,state='fully_refunded';
do $$ begin
 begin update billing_private.invoice_periods set amount_refunded=0,state='paid';
   raise check_violation using message='Refund resurrection accepted';
 exception when raise_exception then null; end;
 begin update billing_private.invoice_periods set amount_paid=600;
   raise check_violation using message='Invoice mutation accepted';
 exception when raise_exception then null; end;
end $$;
insert into billing_private.webhook_events(event_id,event_type,livemode,stripe_created_at,state)
 values ('evt_REVIEW_ONLY','invoice.paid',false,now(),'pending');
do $$ begin
 begin insert into billing_private.webhook_events(event_id,event_type,livemode,stripe_created_at,state)
   values ('evt_REVIEW_ONLY','invoice.paid',false,now(),'pending');
   raise exception 'Duplicate event accepted'; exception when unique_violation then null; end;
end $$;
update billing_private.webhook_events set state='failed',attempts=1;
update billing_private.webhook_events set state='processing',attempts=2;
update billing_private.webhook_events set state='processed',processed_at=now();
reset role;
rollback;
-- Fixtures and all test writes must disappear.
do $$ begin
 if exists(select 1 from public.plus_entitlements)
    or exists(select 1 from billing_private.customers)
    or exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) then
   raise exception 'Test rollback failed';
 end if;
end $$;
