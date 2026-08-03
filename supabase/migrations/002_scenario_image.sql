-- Optional image on scenarios (run in Supabase SQL editor after 001_schema.sql)

alter table public.scenarios
  add column if not exists image_url text;

-- Drop then recreate so column order can change (CREATE OR REPLACE cannot rename/reorder columns)
drop view if exists public.scenarios_employee;
drop view if exists public.scenarios_admin;

create view public.scenarios_employee as
select
  s.id,
  c.label as category,
  s.title,
  s.situation as scenario,
  s.solution,
  s.tags,
  s.sort_order,
  s.updated_at,
  s.image_url
from public.scenarios s
join public.categories c on c.slug = s.category_slug
where s.is_published = true
order by s.sort_order, s.id;

create view public.scenarios_admin as
select
  s.id,
  c.label as category,
  s.title,
  s.situation as scenario,
  s.solution,
  s.tags,
  s.sort_order,
  s.is_published,
  s.updated_at,
  s.image_url
from public.scenarios s
join public.categories c on c.slug = s.category_slug
order by s.sort_order, s.id;

grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
