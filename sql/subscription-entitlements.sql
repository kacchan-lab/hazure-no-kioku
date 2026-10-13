-- REVIEW ONLY: new test database schema proposal; NOT applied.
-- Not an automatic migration of the previous one-time-purchase proposal.
begin;
select pg_catalog.pg_advisory_xact_lock(847302, 1);
-- Fail closed on rerun or pre-existing objects. Never silently adopt an old schema.
do $preflight$
begin
  if pg_catalog.to_regnamespace('billing_private') is not null
     or pg_catalog.to_regclass('public.plus_entitlements') is not null
     or pg_catalog.to_regprocedure('public.get_plus_access()') is not null then
    raise exception 'Existing billing objects: stop and review a versioned migration';
  end if;
  if pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
     or pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'Client roles must not have CREATE on public schema';
  end if;
  if current_user in ('anon','authenticated','service_role')
     or exists (select 1 from pg_catalog.pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
     or pg_catalog.pg_has_role('anon','service_role','MEMBER')
     or pg_catalog.pg_has_role('authenticated','service_role','MEMBER')
     or pg_catalog.pg_has_role('anon',current_user,'MEMBER')
     or pg_catalog.pg_has_role('authenticated',current_user,'MEMBER') then
    raise exception 'Unsafe client membership or migration owner';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'Expected server-only service_role with BYPASSRLS';
  end if;
end
$preflight$;
create schema billing_private;
revoke all on schema billing_private from public, anon, authenticated;
grant usage on schema billing_private to service_role;
-- Applies to the migration owner only; audit any other future object owners.
alter default privileges in schema billing_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema billing_private revoke execute on functions from public, anon, authenticated;

create table billing_private.customers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  stripe_customer_id text not null unique,
  livemode boolean not null,
  reconcile_generation bigint not null default 0 check (reconcile_generation >= 0),
  reconcile_owner uuid,
  reconcile_lease_until timestamptz,
  updated_at timestamptz not null default now()
);
create table billing_private.subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references billing_private.customers(user_id),
  product_code text not null check (product_code = 'hazure_plus'),
  stripe_price_id text not null,
  status text not null check (status in
    ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  ended_at timestamptz,
  next_invoice_at timestamptz,
  blocked_at timestamptz,
  reconciled_at timestamptz not null default now(),
  check ((current_period_start is null and current_period_end is null) or
    (current_period_start is not null and current_period_end is not null
     and isfinite(current_period_start) and isfinite(current_period_end)
     and current_period_start < current_period_end)),
  check (not cancel_at_period_end or next_invoice_at is null)
);
create index subscriptions_user on billing_private.subscriptions(user_id);
-- Paid periods, not a permanent purchased flag. Refunds map to a specific invoice.
create table billing_private.invoice_periods (
  stripe_invoice_id text primary key,
  stripe_subscription_id text not null references billing_private.subscriptions(stripe_subscription_id),
  stripe_payment_id text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount_paid bigint not null check (amount_paid >= 0),
  amount_refunded bigint not null default 0 check (amount_refunded >= 0 and amount_refunded <= amount_paid),
  currency text not null check (currency = 'jpy'),
  state text not null check (state in ('paid','fully_refunded','disputed','void')),
  check (isfinite(period_start) and isfinite(period_end) and period_start < period_end),
  check (state <> 'paid' or (amount_paid > 0 and amount_refunded < amount_paid)),
  check (state <> 'fully_refunded' or (amount_paid > 0 and amount_refunded = amount_paid))
);
create table billing_private.webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  state text not null check (state in ('pending','processing','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text
);
-- Browser-visible summary only. No Stripe identifiers or payment details.
create table public.plus_entitlements (
  user_id uuid not null references auth.users(id) on delete restrict,
  product_code text not null check (product_code = 'hazure_plus'),
  status text not null check (status in ('none','active','expired','suspended')),
  valid_from timestamptz,
  valid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  next_invoice_at timestamptz,
  payment_state text not null check (payment_state in ('none','paid','failed','refunded','disputed')),
  verified_at timestamptz not null,
  primary key (user_id, product_code),
  check (status <> 'active' or (valid_from is not null and valid_until is not null and valid_from < valid_until)),
  check (not cancel_at_period_end or next_invoice_at is null),
  check (valid_from is null or isfinite(valid_from)),
  check (valid_until is null or isfinite(valid_until)),
  check (current_period_end is null or isfinite(current_period_end)),
  check (next_invoice_at is null or isfinite(next_invoice_at)),
  check (isfinite(verified_at)),
  check (status <> 'active' or payment_state in ('paid','failed'))
);

-- Trusted writers still cannot resurrect a refunded period through a late event.
create function billing_private.guard_invoice_update() returns trigger
language plpgsql security invoker set search_path = '' as $guard$
begin
  if new.stripe_invoice_id is distinct from old.stripe_invoice_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.stripe_payment_id is distinct from old.stripe_payment_id
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.amount_paid is distinct from old.amount_paid
     or new.currency is distinct from old.currency then
    raise exception 'Settled invoice identity and paid period are immutable';
  end if;
  if new.amount_refunded < old.amount_refunded
     or (old.state in ('fully_refunded','void') and new.state <> old.state) then
    raise exception 'Refund/void regression rejected';
  end if;
  return new;
end
$guard$;
revoke all on function billing_private.guard_invoice_update() from public, anon, authenticated;
grant execute on function billing_private.guard_invoice_update() to service_role;
create trigger protect_invoice_period before update on billing_private.invoice_periods
  for each row execute function billing_private.guard_invoice_update();

alter table public.plus_entitlements enable row level security;
revoke all on public.plus_entitlements from public, anon, authenticated;
grant select on public.plus_entitlements to authenticated;
grant select, insert, update, delete on public.plus_entitlements to service_role;
create policy read_own_subscription_entitlement
  on public.plus_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);
-- No client write policies, and no client EXECUTE on future reconciliation RPCs.
alter table billing_private.customers enable row level security;
alter table billing_private.subscriptions enable row level security;
alter table billing_private.invoice_periods enable row level security;
alter table billing_private.webhook_events enable row level security;
revoke all on all tables in schema billing_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema billing_private to service_role;
-- Do not let the ordinary worker erase a terminal refund then reinsert it as paid.
revoke delete, truncate on billing_private.invoice_periods from service_role;
-- Self-only read helper. Does not trust the status column alone.
-- Five minutes is the initial maximum snapshot age; change via reviewed migration.
create function public.get_plus_access()
returns table (verification_status text, allowed boolean, valid_until timestamptz)
language sql stable security invoker set search_path = '' as $access$
  with snapshot as (
    select e.*, (select auth.uid()) as caller_id,
      pg_catalog.statement_timestamp() as checked_now
    from (values (1)) as seed(n)
    left join public.plus_entitlements e
      on e.user_id = (select auth.uid()) and e.product_code = 'hazure_plus'
  ), decision as (
    select *, case
      when caller_id is null then 'unknown'
      when user_id is null then 'none'
      when verified_at > checked_now or verified_at < checked_now - interval '5 minutes' then 'error'
      when status = 'active' and valid_from <= checked_now and checked_now < valid_until then 'active'
      when status = 'active' and checked_now < valid_from then 'not_started'
      when status = 'active' then 'expired'
      else status end as result
    from snapshot
  )
  select result, result = 'active', decision.valid_until from decision;
$access$;
revoke all on function public.get_plus_access() from public, anon, authenticated;
grant execute on function public.get_plus_access() to authenticated;
commit;
