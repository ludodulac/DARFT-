-- DARFT core schema for a shared Supabase project (currently Wikignose)
-- Every DARFT database object is explicitly namespaced with darft_*.

create extension if not exists pgcrypto;

do $$ begin
  create type public.darft_submission_status as enum (
    'received','needs_info','in_review','selected','revisit','archive','rejected'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.darft_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member','reviewer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.darft_artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  location text,
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.darft_artworks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.darft_artists(id) on delete cascade,
  title text not null,
  year integer,
  medium text not null,
  dimensions text not null,
  price_eur numeric(12,2),
  availability text not null default 'available' check (availability in ('available','reserved','not_for_sale','sold')),
  story text not null,
  process text,
  public_slug text unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.darft_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  artwork_id uuid not null unique references public.darft_artworks(id) on delete cascade,
  status public.darft_submission_status not null default 'received',
  archive_consent boolean not null default false,
  rights_confirmed boolean not null default false,
  review_positive text,
  review_reserve text,
  review_message text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.darft_submission_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.darft_submissions(id) on delete cascade,
  storage_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.darft_submission_status_history (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.darft_submissions(id) on delete cascade,
  old_status public.darft_submission_status,
  new_status public.darft_submission_status not null,
  changed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.is_darft_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.darft_profiles
    where id = (select auth.uid()) and role in ('admin','reviewer')
  );
$$;

create or replace function public.darft_touch_submission_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists darft_submissions_touch_updated_at on public.darft_submissions;
create trigger darft_submissions_touch_updated_at
before update on public.darft_submissions
for each row execute function public.darft_touch_submission_updated_at();

create or replace function public.darft_log_submission_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.darft_submission_status_history(submission_id, old_status, new_status, changed_by)
    values(new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists darft_submissions_status_history on public.darft_submissions;
create trigger darft_submissions_status_history
after update on public.darft_submissions
for each row execute function public.darft_log_submission_status_change();

alter table public.darft_profiles enable row level security;
alter table public.darft_artists enable row level security;
alter table public.darft_artworks enable row level security;
alter table public.darft_submissions enable row level security;
alter table public.darft_submission_images enable row level security;
alter table public.darft_submission_status_history enable row level security;

drop policy if exists darft_profiles_read_self on public.darft_profiles;
create policy darft_profiles_read_self on public.darft_profiles
for select to authenticated using (id = (select auth.uid()));

drop policy if exists darft_admins_read_artists on public.darft_artists;
create policy darft_admins_read_artists on public.darft_artists
for select to authenticated using (public.is_darft_admin());

drop policy if exists darft_admins_update_artists on public.darft_artists;
create policy darft_admins_update_artists on public.darft_artists
for update to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

drop policy if exists darft_public_read_selected_artworks on public.darft_artworks;
create policy darft_public_read_selected_artworks on public.darft_artworks
for select to anon, authenticated using (is_public = true);

drop policy if exists darft_admins_all_artworks on public.darft_artworks;
create policy darft_admins_all_artworks on public.darft_artworks
for all to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

drop policy if exists darft_admins_read_submissions on public.darft_submissions;
create policy darft_admins_read_submissions on public.darft_submissions
for select to authenticated using (public.is_darft_admin());

drop policy if exists darft_admins_update_submissions on public.darft_submissions;
create policy darft_admins_update_submissions on public.darft_submissions
for update to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

drop policy if exists darft_admins_read_submission_images on public.darft_submission_images;
create policy darft_admins_read_submission_images on public.darft_submission_images
for select to authenticated using (public.is_darft_admin());

drop policy if exists darft_admins_read_status_history on public.darft_submission_status_history;
create policy darft_admins_read_status_history on public.darft_submission_status_history
for select to authenticated using (public.is_darft_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('darft-submission-images','darft-submission-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists darft_team_read_submission_files on storage.objects;
create policy darft_team_read_submission_files on storage.objects
for select to authenticated using (bucket_id = 'darft-submission-images' and public.is_darft_admin());

create or replace view public.darft_submissions_admin
with (security_invoker = true)
as
select
  s.id, s.reference, s.status, s.archive_consent, s.rights_confirmed,
  s.review_positive, s.review_reserve, s.review_message, s.reviewed_at, s.created_at,
  a.id as artist_id, a.name as artist_name, a.email, a.phone, a.location, a.bio as artist_bio,
  w.id as artwork_id, w.title, w.year, w.medium, w.dimensions, w.price_eur,
  w.availability, w.story, w.process
from public.darft_submissions s
join public.darft_artworks w on w.id = s.artwork_id
join public.darft_artists a on a.id = w.artist_id;

grant select on public.darft_submissions_admin to authenticated;
comment on view public.darft_submissions_admin is 'Admin review surface for DARFT submissions in a shared Supabase project.';
