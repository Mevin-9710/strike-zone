-- Strike Zone site schema: ideas board + votes + email subscribers. Idempotent.
create table if not exists public.ideas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  body text check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.idea_votes (
  idea_id bigint not null references public.ideas(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)          -- one vote per user per idea
);

create table if not exists public.subscribers (
  id bigint generated always as identity primary key,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace view public.ideas_ranked with (security_invoker = true) as
  select i.id, i.title, i.body, i.created_at, i.user_id,
         (select count(*) from public.idea_votes v where v.idea_id = i.id)::int as votes
  from public.ideas i;

alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.subscribers enable row level security;

drop policy if exists "ideas readable" on public.ideas;
create policy "ideas readable" on public.ideas for select using (true);
drop policy if exists "ideas insert own" on public.ideas;
create policy "ideas insert own" on public.ideas for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ideas delete own" on public.ideas;
create policy "ideas delete own" on public.ideas for delete to authenticated using (user_id = auth.uid());

drop policy if exists "votes readable" on public.idea_votes;
create policy "votes readable" on public.idea_votes for select using (true);
drop policy if exists "votes insert own" on public.idea_votes;
create policy "votes insert own" on public.idea_votes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "votes delete own" on public.idea_votes;
create policy "votes delete own" on public.idea_votes for delete to authenticated using (user_id = auth.uid());

-- Anyone may subscribe; nobody can read the list through the API (service role only).
drop policy if exists "subscribe anyone" on public.subscribers;
create policy "subscribe anyone" on public.subscribers for insert to anon, authenticated with check (true);

grant select on public.ideas, public.idea_votes, public.ideas_ranked to anon, authenticated;
grant insert, delete on public.ideas, public.idea_votes to authenticated;
grant insert on public.subscribers to anon, authenticated;
