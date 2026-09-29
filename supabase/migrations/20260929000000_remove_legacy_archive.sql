-- Permanent deletion is the only supported way to remove a magazine issue.
revoke all on function public.archive_magazine_issue(text, text)
  from public, anon, authenticated;

drop function if exists public.archive_magazine_issue(text, text);

do $$
begin
  if exists (select 1 from public.magazine_issues where status = 'archived') then
    raise exception 'archived magazine issues must be permanently deleted before applying this migration';
  end if;
end
$$;

alter table public.magazine_issues
  drop constraint if exists magazine_issues_status_check;

alter table public.magazine_issues
  add constraint magazine_issues_status_check
  check (status in ('draft', 'scheduled', 'published'));

comment on constraint magazine_issues_status_check on public.magazine_issues is
  'Issues are either unpublished work, scheduled, or published. Removal uses begin_magazine_issue_deletion and never an archived state.';

-- Ensure fresh environments do not retain the retired Repository asset URLs.
update public.magazine_issues
set
  pdf_url = 'https://zolmotvxzxzlhgyyrnxn.supabase.co/storage/v1/object/public/magazine-public/issues/' || issue_id || '/' || issue_id || '.pdf',
  cover_image = 'https://zolmotvxzxzlhgyyrnxn.supabase.co/storage/v1/object/public/magazine-public/covers/' || issue_id || '/' || issue_id || '.jpg',
  pdf_storage_path = 'issues/' || issue_id || '/' || issue_id || '.pdf',
  cover_storage_path = 'covers/' || issue_id || '/' || issue_id || '.jpg'
where issue_id in ('2026-06', '2026-07', '2026-08', '2026-09')
  and (
    pdf_url like '/demo/issues/%'
    or cover_image like '/demo/covers/%'
    or pdf_storage_path is null
    or cover_storage_path is null
  );
