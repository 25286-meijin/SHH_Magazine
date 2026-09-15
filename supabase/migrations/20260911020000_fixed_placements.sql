insert into public.placements (name, active)
values
  ('1F大廳', true),
  ('2F大電視牆', true),
  ('1F關防', true),
  ('B基地美食廣場', true),
  ('空橋直式', true),
  ('雙和故事館', true),
  ('骨科', true),
  ('腎臟+泌尿科', true),
  ('綜合檢查中心', true)
on conflict (name) do update set active = true;
