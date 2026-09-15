create extension if not exists pg_cron with schema extensions;

alter table public.magazine_issues
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists set_latest_on_publish boolean not null default false,
  add column if not exists schedule_last_attempt_at timestamptz,
  add column if not exists schedule_error text;

alter table public.magazine_issues
  drop constraint if exists magazine_issues_status_check;

alter table public.magazine_issues
  add constraint magazine_issues_status_check
  check (status in ('draft', 'scheduled', 'published', 'archived'));

alter table public.magazine_issues
  add constraint scheduled_issue_has_publish_time
  check (status <> 'scheduled' or scheduled_publish_at is not null);

create or replace function public.publish_due_magazine_issues()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_issue record;
  published_count integer := 0;
begin
  for due_issue in
    select id, issue_id, set_latest_on_publish
    from public.magazine_issues
    where status = 'scheduled'
      and scheduled_publish_at <= now()
    order by scheduled_publish_at, issue_id
    for update skip locked
  loop
    begin
      update public.magazine_issues
      set schedule_last_attempt_at = now(), schedule_error = null
      where id = due_issue.id;

      if due_issue.set_latest_on_publish then
        update public.magazine_issues set is_latest = false where is_latest;
      end if;

      update public.magazine_issues
      set status = 'published',
          is_latest = due_issue.set_latest_on_publish,
          published_at = now(),
          schedule_last_attempt_at = now(),
          schedule_error = null
      where id = due_issue.id;

      published_count := published_count + 1;
    exception when others then
      update public.magazine_issues
      set schedule_last_attempt_at = now(), schedule_error = left(sqlerrm, 500)
      where id = due_issue.id;
    end;
  end loop;
  return published_count;
end
$$;

revoke all on function public.publish_due_magazine_issues() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('publish-due-magazine-issues');
exception when others then
  null;
end
$$;

select cron.schedule(
  'publish-due-magazine-issues',
  '* * * * *',
  'select public.publish_due_magazine_issues();'
);

comment on column public.magazine_issues.scheduled_publish_at is
  'UTC instant converted from an administrator-entered Asia/Taipei date and time.';
