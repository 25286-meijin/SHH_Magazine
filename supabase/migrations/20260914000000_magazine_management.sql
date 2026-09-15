create table public.magazine_issues (
  id uuid primary key default gen_random_uuid(),
  issue_id text not null unique check (issue_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  year integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  publish_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_latest boolean not null default false,
  issue_number text check (issue_number is null or char_length(issue_number) <= 32),
  homepage_headline text not null check (char_length(homepage_headline) between 1 and 160),
  homepage_summary text not null check (char_length(homepage_summary) between 1 and 1000),
  cover_title text check (cover_title is null or char_length(cover_title) between 1 and 160),
  outpatient_start_page integer not null check (outpatient_start_page > 0),
  outpatient_end_page integer check (
    outpatient_end_page is null or outpatient_end_page >= outpatient_start_page
  ),
  shuttle_page integer not null check (shuttle_page > 0),
  pdf_url text not null check (pdf_url ~ '^(https://|/)'),
  cover_image text not null check (cover_image ~ '^(https://|/)'),
  pdf_storage_path text,
  cover_storage_path text,
  pdf_page_count integer check (pdf_page_count is null or pdf_page_count > 0),
  features jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint issue_year_month_match check (
    issue_id = year::text || '-' || lpad(month::text, 2, '0')
  ),
  constraint latest_must_be_published check (not is_latest or status = 'published')
);

create unique index one_latest_magazine_issue
  on public.magazine_issues(is_latest)
  where is_latest;

create table public.magazine_issue_aliases (
  alias text primary key check (alias ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  magazine_issue_id uuid not null references public.magazine_issues(id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.touch_magazine_issue_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger touch_magazine_issue_updated_at
before update on public.magazine_issues
for each row execute function public.touch_magazine_issue_updated_at();

alter table public.magazine_issues enable row level security;
alter table public.magazine_issue_aliases enable row level security;

revoke all on public.magazine_issues, public.magazine_issue_aliases from anon;
grant select on public.magazine_issues, public.magazine_issue_aliases to anon;
grant select, insert, update on public.magazine_issues, public.magazine_issue_aliases to authenticated;

create policy "published issues are public" on public.magazine_issues
  for select to anon using (status = 'published');
create policy "published issue aliases are public" on public.magazine_issue_aliases
  for select to anon using (
    exists (
      select 1 from public.magazine_issues issue
      where issue.id = magazine_issue_id and issue.status = 'published'
    )
  );
create policy "admins manage magazine issues" on public.magazine_issues
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage magazine issue aliases" on public.magazine_issue_aliases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.set_latest_magazine_issue(target_issue_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin role required'; end if;
  if not exists (
    select 1 from public.magazine_issues
    where issue_id = target_issue_id and status = 'published'
  ) then raise exception 'published issue not found'; end if;
  update public.magazine_issues set is_latest = false where is_latest;
  update public.magazine_issues
    set is_latest = true, updated_by = auth.uid()
    where issue_id = target_issue_id and status = 'published';
end
$$;

create or replace function public.archive_magazine_issue(
  target_issue_id text,
  replacement_issue_id text default null
)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_is_latest boolean;
begin
  if not public.is_admin() then raise exception 'admin role required'; end if;
  select is_latest into target_is_latest from public.magazine_issues where issue_id = target_issue_id;
  if target_is_latest is null then raise exception 'issue not found'; end if;
  if target_is_latest then
    if replacement_issue_id is null or not exists (
      select 1 from public.magazine_issues
      where issue_id = replacement_issue_id and status = 'published'
    ) then raise exception 'published replacement issue required'; end if;
    update public.magazine_issues set is_latest = false where issue_id = target_issue_id;
    update public.magazine_issues
      set is_latest = true, updated_by = auth.uid()
      where issue_id = replacement_issue_id;
  end if;
  update public.magazine_issues
    set status = 'archived', is_latest = false, updated_by = auth.uid()
    where issue_id = target_issue_id;
end
$$;

revoke all on function public.set_latest_magazine_issue(text) from public, anon;
revoke all on function public.archive_magazine_issue(text, text) from public, anon;
grant execute on function public.set_latest_magazine_issue(text) to authenticated;
grant execute on function public.archive_magazine_issue(text, text) to authenticated;

insert into public.magazine_issues (
  issue_id, year, month, publish_date, status, is_latest, issue_number,
  homepage_headline, homepage_summary, cover_title,
  outpatient_start_page, outpatient_end_page, shuttle_page,
  pdf_url, cover_image, features
) values
  ('2026-06', 2026, 6, '2026-06-01', 'published', false, null,
   '影像的監控者 影像醫學部', '請由實際刊物 metadata 補入。', null,
   10, null, 17, '/demo/issues/2026-06.pdf', '/demo/covers/2026-06.jpg', '[]'::jsonb),
  ('2026-07', 2026, 7, '2026-07-01', 'published', false, null,
   '雙和18 幸福醫家－院慶特輯', '請由實際刊物 metadata 補入。', null,
   10, null, 17, '/demo/issues/2026-07.pdf', '/demo/covers/2026-07.jpg', '[]'::jsonb),
  ('2026-08', 2026, 8, '2026-08-01', 'published', false, null,
   '明承經典 燦動非凡', 'Demo 階段請以實際醫訊封面主題與編輯摘要取代此文字。', null,
   10, null, 17, '/demo/issues/2026-08.pdf', '/demo/covers/2026-08.jpg', '[]'::jsonb),
  ('2026-09', 2026, 9, '2026-09-01', 'published', true, '2026-09',
   '手術新紀元：達文西機械手臂', 'Demo 階段請以實際醫訊封面主題與編輯摘要取代此文字。', '手術新紀元：達文西機械手臂',
   10, 16, 17, '/demo/issues/2026-09.pdf', '/demo/covers/2026-09.jpg', '[]'::jsonb)
on conflict (issue_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('magazine-staging', 'magazine-staging', false, 52428800, array['application/pdf', 'image/jpeg']),
  ('magazine-public', 'magazine-public', true, 52428800, array['application/pdf', 'image/jpeg'])
on conflict (id) do nothing;

create policy "admins manage magazine storage" on storage.objects
  for all to authenticated
  using (bucket_id in ('magazine-staging', 'magazine-public') and public.is_admin())
  with check (bucket_id in ('magazine-staging', 'magazine-public') and public.is_admin());

comment on table public.magazine_issues is
  'Editorial metadata for public SHH Magazine issues. Do not store personal or patient data.';
