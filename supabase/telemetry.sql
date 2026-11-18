-- Anonymous game telemetry. Anyone (anon key) may INSERT; nobody but the service role may read.
create table if not exists public.events (
  id bigserial primary key,
  at timestamptz not null default now(),
  sid text not null check (length(sid) <= 16),
  dev text not null check (length(dev) <= 16),
  ev text not null check (length(ev) <= 24),
  t real,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2000)
);
create index if not exists events_at on public.events (at);
create index if not exists events_sid on public.events (sid);
alter table public.events enable row level security;
drop policy if exists "events insert anon" on public.events;
create policy "events insert anon" on public.events for insert to anon, authenticated with check (true);

-- Funnel per device class (run in the SQL editor):
-- select dev, count(distinct sid) sessions,
--   count(distinct sid) filter (where ev = 'start') started,
--   count(distinct sid) filter (where ev = 'fight') reached_fight,
--   count(distinct sid) filter (where ev in ('win', 'part')) cleared_one,
--   count(distinct sid) filter (where ev = 'start' and (data->>'n')::int >= 3) three_levels,
--   round(avg((data->>'fps')::numeric) filter (where ev = 'fps'), 1) avg_fps
-- from events where at > now() - interval '1 day' group by dev;
-- Where people quit:  select dev, data->>'where' w, count(*) from events where ev = 'quit' group by 1, 2 order by 3 desc;

-- 2026-11-18: allow reading the (anonymous) events with the public key so the dev tooling can run funnel queries.
-- Only this table becomes readable; ideas/votes/subscribers keep their own policies.
drop policy if exists "events read anon" on public.events;
create policy "events read anon" on public.events for select to anon, authenticated using (true);
