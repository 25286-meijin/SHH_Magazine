create table public.magazine_issue_deletion_jobs (
  issue_id text primary key check (issue_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'storage_pending'
    check (status in ('storage_pending', 'storage_failed')),
  public_paths text[] not null default '{}',
  db_counts jsonb not null default '{}'::jsonb,
  last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.magazine_issue_deletion_jobs enable row level security;
revoke all on public.magazine_issue_deletion_jobs from public, anon, authenticated;

comment on table public.magazine_issue_deletion_jobs is
  'Retry state for issue deletion after the transactional database phase and before Storage cleanup completes.';

create or replace function public.begin_magazine_issue_deletion(
  target_issue_id text,
  replacement_issue_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_issue public.magazine_issues%rowtype;
  existing_job public.magazine_issue_deletion_jobs%rowtype;
  topic_ids uuid[] := '{}'::uuid[];
  deleted_events integer := 0;
  deleted_routes integer := 0;
  deleted_topics integer := 0;
  deleted_aliases integer := 0;
  deleted_issues integer := 0;
  paths text[];
  counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin role required';
  end if;

  select * into existing_job
  from public.magazine_issue_deletion_jobs
  where issue_id = target_issue_id;

  if found then
    return jsonb_build_object(
      'issue_id', existing_job.issue_id,
      'public_paths', to_jsonb(existing_job.public_paths),
      'db_counts', existing_job.db_counts,
      'retry', true
    );
  end if;

  select * into target_issue
  from public.magazine_issues
  where issue_id = target_issue_id
  for update;

  if not found then
    raise exception 'issue not found';
  end if;

  if target_issue.is_latest then
    if replacement_issue_id is null or replacement_issue_id = target_issue_id or not exists (
      select 1 from public.magazine_issues
      where issue_id = replacement_issue_id and status = 'published'
    ) then
      raise exception 'published replacement issue required';
    end if;

    update public.magazine_issues
    set is_latest = false, updated_by = auth.uid()
    where issue_id = target_issue_id;

    update public.magazine_issues
    set is_latest = true, updated_by = auth.uid()
    where issue_id = replacement_issue_id and status = 'published';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into topic_ids
  from public.qr_topics
  where issue_id = target_issue_id;

  paths := array_remove(array[
    target_issue.pdf_storage_path,
    target_issue.cover_storage_path
  ], null);

  delete from public.qr_events
  where issue_id = target_issue_id or topic_id = any(topic_ids);
  get diagnostics deleted_events = row_count;

  delete from public.qr_routes where topic_id = any(topic_ids);
  get diagnostics deleted_routes = row_count;

  delete from public.qr_topics where issue_id = target_issue_id;
  get diagnostics deleted_topics = row_count;

  delete from public.magazine_issue_aliases
  where magazine_issue_id = target_issue.id;
  get diagnostics deleted_aliases = row_count;

  delete from public.magazine_issues where id = target_issue.id;
  get diagnostics deleted_issues = row_count;

  counts := jsonb_build_object(
    'magazine_issues', deleted_issues,
    'magazine_issue_aliases', deleted_aliases,
    'qr_topics', deleted_topics,
    'qr_routes', deleted_routes,
    'qr_events', deleted_events
  );

  insert into public.magazine_issue_deletion_jobs (
    issue_id, status, public_paths, db_counts, created_by
  ) values (
    target_issue_id, 'storage_pending', paths, counts, auth.uid()
  );

  return jsonb_build_object(
    'issue_id', target_issue_id,
    'public_paths', to_jsonb(paths),
    'db_counts', counts,
    'retry', false
  );
end
$$;

revoke all on function public.begin_magazine_issue_deletion(text, text) from public, anon;
grant execute on function public.begin_magazine_issue_deletion(text, text) to authenticated;

