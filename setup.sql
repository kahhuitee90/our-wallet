-- Paste this into Supabase: SQL Editor > New query > Run.
create table if not exists entries (
  wallet text not null,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  primary key (wallet, id)
);

alter table entries enable row level security;

-- A phone can only see and change rows for the wallet code it sends.
create policy "own wallet only" on entries for all to anon
  using (wallet = coalesce(current_setting('request.headers', true)::json ->> 'x-wallet', ''))
  with check (wallet = coalesce(current_setting('request.headers', true)::json ->> 'x-wallet', ''));

grant select, insert, update on entries to anon;
