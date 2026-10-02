insert into public.placements (name, active)
values ('神經科', true)
on conflict (name) do update set active = true;
