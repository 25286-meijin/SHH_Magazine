alter table public.qr_topics
  add column if not exists page_number integer
  check (page_number is null or page_number > 0);

create unique index if not exists unique_qr_topic_definition
  on public.qr_topics(issue_id, title, page_number)
  where page_number is not null;

create or replace function public.qr_topic_counts_by_issue(target_issue_id text)
returns table(topic_title text, qr_entries bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(e.topic_title, '-'), count(*)
  from public.qr_events e
  where e.event_type = 'qr_entry'
    and e.issue_id = target_issue_id
  group by coalesce(e.topic_title, '-')
  order by count(*) desc
$$;

create or replace function public.qr_placement_counts_by_issue(target_issue_id text)
returns table(placement_name text, qr_entries bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(e.placement_name, '-'), count(*)
  from public.qr_events e
  where e.event_type = 'qr_entry'
    and e.issue_id = target_issue_id
  group by coalesce(e.placement_name, '-')
  order by count(*) desc
$$;

revoke all on function public.qr_topic_counts_by_issue(text) from public, anon;
revoke all on function public.qr_placement_counts_by_issue(text) from public, anon;
grant execute on function public.qr_topic_counts_by_issue(text) to authenticated;
grant execute on function public.qr_placement_counts_by_issue(text) to authenticated;
