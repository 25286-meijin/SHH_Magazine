create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create table public.qr_topics (
  id uuid primary key default gen_random_uuid(),
  issue_id text not null,
  title text not null check (char_length(title) between 1 and 160),
  destination_path text not null check (destination_path ~ '^/(issues|read)/[A-Za-z0-9_-]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.qr_routes (
  id uuid primary key default gen_random_uuid(),
  qr_id text not null unique check (qr_id ~ '^qr_[A-Za-z0-9_-]{20,80}$'),
  topic_id uuid not null references public.qr_topics(id),
  placement_id uuid not null references public.placements(id),
  destination_path text not null check (destination_path ~ '^/(issues|read)/[A-Za-z0-9_-]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deactivated_at timestamptz,
  constraint active_route_requires_active_timestamp check (active or deactivated_at is not null)
);

create unique index one_active_route_per_topic_placement
  on public.qr_routes(topic_id, placement_id)
  where active;

create table public.qr_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'qr_entry', 'read_start', 'read_25', 'read_50', 'read_75',
    'read_90', 'read_complete', 'engagement_heartbeat', 'page_jump',
    'reader_error'
  )),
  received_at_utc timestamptz not null default now(),
  qr_entry_at_utc timestamptz,
  entry_id uuid,
  session_id uuid,
  qr_id text,
  topic_id uuid references public.qr_topics(id),
  topic_title text,
  placement_id uuid references public.placements(id),
  placement_name text,
  issue_id text,
  page_number integer check (page_number is null or page_number > 0),
  active_engagement_seconds integer check (active_engagement_seconds is null or active_engagement_seconds >= 0),
  elapsed_session_seconds integer check (elapsed_session_seconds is null or elapsed_session_seconds >= 0),
  final boolean not null default false
);

create index qr_events_received_at_idx on public.qr_events(received_at_utc desc);
create index qr_events_entry_id_idx on public.qr_events(entry_id);
create index qr_events_topic_idx on public.qr_events(topic_id, received_at_utc desc);
create index qr_events_placement_idx on public.qr_events(placement_id, received_at_utc desc);

alter table public.qr_topics enable row level security;
alter table public.placements enable row level security;
alter table public.qr_routes enable row level security;
alter table public.qr_events enable row level security;

revoke all on public.qr_topics, public.placements, public.qr_routes, public.qr_events from anon;
grant select, insert, update on public.qr_topics, public.placements, public.qr_routes to authenticated;
grant select on public.qr_events to authenticated;

create policy "admins manage topics" on public.qr_topics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage placements" on public.placements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage qr routes" on public.qr_routes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read qr events" on public.qr_events
  for select to authenticated using (public.is_admin());

create or replace function public.qr_topic_counts()
returns table(topic_id uuid, topic_title text, qr_entries bigint)
language sql stable security invoker set search_path = ''
as $$
  select e.topic_id, coalesce(t.title, e.topic_title), count(*)
  from public.qr_events e
  left join public.qr_topics t on t.id = e.topic_id
  where e.event_type = 'qr_entry'
  group by e.topic_id, coalesce(t.title, e.topic_title)
  order by count(*) desc
$$;

create or replace function public.qr_placement_counts()
returns table(placement_id uuid, placement_name text, qr_entries bigint)
language sql stable security invoker set search_path = ''
as $$
  select e.placement_id, coalesce(p.name, e.placement_name), count(*)
  from public.qr_events e
  left join public.placements p on p.id = e.placement_id
  where e.event_type = 'qr_entry'
  group by e.placement_id, coalesce(p.name, e.placement_name)
  order by count(*) desc
$$;

revoke all on function public.qr_topic_counts() from public, anon;
revoke all on function public.qr_placement_counts() from public, anon;
grant execute on function public.qr_topic_counts() to authenticated;
grant execute on function public.qr_placement_counts() to authenticated;

comment on table public.qr_events is
  'Server-written QR entries and anonymous reading interactions. Do not add personal or patient data.';
