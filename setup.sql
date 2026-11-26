-- Our Wallet database setup.
-- Paste all of this into Supabase: SQL Editor > New query > Run. Safe to run again.

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Wallet',
  currency text not null default 'RM',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists members (
  wallet_id uuid not null references wallets(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (wallet_id, user_id)
);

create table if not exists invites (
  wallet_id uuid not null references wallets(id) on delete cascade,
  email text not null,
  invited_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (wallet_id, email)
);

-- One row per money movement.
--   type 'in'     : who added money to the pool
--   type 'out'    : who spent, on what. paid_from 'pool' or 'own' (own pocket, split between you)
--   type 'settle' : who paid the other person back for own-pocket costs
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id) on delete cascade,
  type text not null check (type in ('in', 'out', 'settle')),
  amount bigint not null check (amount > 0), -- cents
  date date not null default current_date,
  person uuid not null,          -- who added, spent, or paid back
  to_person uuid,                -- settle only: who was paid back
  paid_from text not null default 'pool' check (paid_from in ('pool', 'own')),
  category text not null default '',
  note text not null default '',
  split jsonb,                   -- own-pocket spends: how the cost is shared
  created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists entries_wallet_date on entries (wallet_id, date);

-- Is the signed-in user a member of this wallet?
create or replace function is_member(w uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from members where wallet_id = w and user_id = auth.uid());
$$;

alter table wallets enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table entries enable row level security;

drop policy if exists "members read wallet" on wallets;
create policy "members read wallet" on wallets for select to authenticated using (is_member(id));
drop policy if exists "members edit wallet" on wallets;
create policy "members edit wallet" on wallets for update to authenticated using (is_member(id));

drop policy if exists "members see members" on members;
create policy "members see members" on members for select to authenticated using (is_member(wallet_id));
drop policy if exists "edit own name" on members;
create policy "edit own name" on members for update to authenticated using (user_id = auth.uid());

drop policy if exists "members manage invites" on invites;
create policy "members manage invites" on invites for all to authenticated
  using (is_member(wallet_id)) with check (is_member(wallet_id) and invited_by = auth.uid());

drop policy if exists "members use entries" on entries;
create policy "members use entries" on entries for all to authenticated
  using (is_member(wallet_id)) with check (is_member(wallet_id));

-- Start a new wallet with yourself as the first member.
create or replace function create_wallet(wallet_name text, wallet_currency text, my_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into wallets (name, currency, created_by) values (wallet_name, wallet_currency, auth.uid()) returning id into w;
  insert into members (wallet_id, user_id, email, display_name)
    values (w, auth.uid(), lower(auth.jwt() ->> 'email'), my_name);
  return w;
end $$;

-- Join every wallet that invited your email address.
create or replace function accept_invites(my_name text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into members (wallet_id, user_id, email, display_name)
    select wallet_id, auth.uid(), lower(auth.jwt() ->> 'email'), my_name
    from invites where lower(email) = lower(auth.jwt() ->> 'email')
    on conflict do nothing;
  get diagnostics n = row_count;
  delete from invites where lower(email) = lower(auth.jwt() ->> 'email');
  return n;
end $$;

-- Does my email have an invite waiting? (Invitees are not members yet, so they cannot read invites.)
create or replace function my_invites()
returns table (wallet_id uuid, wallet_name text, invited_by_name text)
language sql security definer stable set search_path = public as $$
  select i.wallet_id, w.name, coalesce(m.display_name, '')
  from invites i join wallets w on w.id = i.wallet_id
  left join members m on m.wallet_id = i.wallet_id and m.user_id = i.invited_by
  where lower(i.email) = lower(auth.jwt() ->> 'email');
$$;

revoke all on function create_wallet(text, text, text) from public, anon;
revoke all on function accept_invites(text) from public, anon;
revoke all on function my_invites() from public, anon;
grant execute on function create_wallet(text, text, text) to authenticated;
grant execute on function accept_invites(text) to authenticated;
grant execute on function my_invites() to authenticated;
grant select, update on wallets to authenticated;
grant select, update on members to authenticated;
grant select, insert, delete on invites to authenticated;
grant select, insert, update, delete on entries to authenticated;

-- Live updates so both phones refresh right away.
do $$ begin
  alter publication supabase_realtime add table entries;
exception when others then null;
end $$;
