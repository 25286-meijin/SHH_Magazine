-- Persist every current and historical issue identifier before aliases are deleted.
-- Storage retries must not depend on alias rows that no longer exist.
alter table public.magazine_issue_deletion_jobs
  add column if not exists storage_issue_ids text[] not null default '{}';

update public.magazine_issue_deletion_jobs
set storage_issue_ids = array[issue_id]
where cardinality(storage_issue_ids) = 0;

comment on column public.magazine_issue_deletion_jobs.storage_issue_ids is
  'Immutable current issue id plus historical aliases used for exact Storage cleanup and retry.';

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
  storage_identifiers text[] := '{}'::text[];
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
    storage_identifiers := case
      when cardinality(existing_job.storage_issue_ids) > 0 then existing_job.storage_issue_ids
      else array[target_issue_id]
    end;
    return jsonb_build_object(
      'issue_id', existing_job.issue_id,
      'storage_issue_ids', to_jsonb(storage_identifiers),
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

  -- Capture aliases before the transaction removes them. This immutable list is
  -- stored in the retry job so a later request never needs deleted alias rows.
  select coalesce(array_agg(identifier order by identifier), array[target_issue_id])
  into storage_identifiers
  from (
    select target_issue_id as identifier
    union
    select alias
    from public.magazine_issue_aliases
    where magazine_issue_id = target_issue.id
  ) identifiers;

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
    issue_id, status, storage_issue_ids, public_paths, db_counts, created_by
  ) values (
    target_issue_id, 'storage_pending', storage_identifiers, paths, counts, auth.uid()
  );

  return jsonb_build_object(
    'issue_id', target_issue_id,
    'storage_issue_ids', to_jsonb(storage_identifiers),
    'public_paths', to_jsonb(paths),
    'db_counts', counts,
    'retry', false
  );
end
$$;

revoke all on function public.begin_magazine_issue_deletion(text, text)
  from public, anon;
grant execute on function public.begin_magazine_issue_deletion(text, text)
  to authenticated;
