-- Empty, unused TEST schema only. Back up first. Never delete live billing data.
begin;
select pg_catalog.pg_advisory_xact_lock(847302, 1);
-- Exclude concurrent writes between the empty-data check and DROP.
lock table public.plus_entitlements, billing_private.customers,
  billing_private.subscriptions, billing_private.invoice_periods,
  billing_private.webhook_events in access exclusive mode;
do $guard$
begin
  if exists (select 1 from public.plus_entitlements)
     or exists (select 1 from billing_private.customers)
     or exists (select 1 from billing_private.subscriptions)
     or exists (select 1 from billing_private.invoice_periods)
     or exists (select 1 from billing_private.webhook_events) then
    raise exception 'Rollback refused: billing data exists; use a reviewed forward migration';
  end if;
end
$guard$;
drop function public.get_plus_access();
drop table public.plus_entitlements;
drop table billing_private.invoice_periods;
drop table billing_private.subscriptions;
drop table billing_private.customers;
drop table billing_private.webhook_events;
drop function billing_private.guard_invoice_update();
-- No CASCADE: unexpected dependencies/objects must stop and roll back removal.
drop schema billing_private;
commit;
