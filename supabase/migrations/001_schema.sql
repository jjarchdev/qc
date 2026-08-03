create extension if not exists pg_trgm with schema extensions;

create table if not exists public.categories (
  slug text primary key,
  label text not null unique,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.scenarios (
  id bigint generated always as identity primary key,

  category_slug text not null references public.categories (slug) on update cascade,

  title text not null check (char_length(trim(title)) > 0),
  situation text not null check (char_length(trim(situation)) > 0),
  solution text not null check (char_length(trim(solution)) > 0),

  tags text[] not null default '{}'::text[],

  image_url text,

  sort_order integer not null default 0,
  is_published boolean not null default true,

  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(situation, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(solution, '')), 'C')
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.scenarios_normalize_tags()
returns trigger
language plpgsql
as $$
begin
  new.tags := coalesce(
    (
      select array_agg(distinct trim(t) order by trim(t))
      from unnest(coalesce(new.tags, '{}'::text[])) as t
      where trim(t) <> ''
    ),
    '{}'::text[]
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_scenarios_normalize on public.scenarios;
create trigger trg_scenarios_normalize
  before insert or update on public.scenarios
  for each row execute function public.scenarios_normalize_tags();

create index if not exists scenarios_category_slug_idx
  on public.scenarios (category_slug);

create index if not exists scenarios_published_sort_idx
  on public.scenarios (is_published, sort_order, id)
  where is_published = true;

create index if not exists scenarios_tags_gin_idx
  on public.scenarios using gin (tags);

create index if not exists scenarios_search_gin_idx
  on public.scenarios using gin (search_vector);

create index if not exists scenarios_title_trgm_idx
  on public.scenarios using gin (title extensions.gin_trgm_ops);

create or replace view public.scenarios_employee as
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

create or replace view public.scenarios_admin as
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

alter table public.categories enable row level security;
alter table public.scenarios enable row level security;

drop policy if exists categories_select_anon on public.categories;
create policy categories_select_anon on public.categories
  for select to anon, authenticated
  using (true);

drop policy if exists scenarios_select_published on public.scenarios;
create policy scenarios_select_published on public.scenarios
  for select to anon, authenticated
  using (is_published = true);

-- API roles need table privileges (secret key / service_role bypasses RLS but still needs GRANTs)
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.categories to anon, authenticated, service_role;
grant all on table public.categories to service_role;
grant select on table public.scenarios to anon, authenticated, service_role;
grant all on table public.scenarios to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
