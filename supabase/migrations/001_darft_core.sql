-- DARFT core schema
-- Apply through Supabase migrations. Public submissions go through the submit-artwork Edge Function.

create extension if not exists pgcrypto;

create type public.submission_status as enum (
  'received','needs_info','in_review','selected','revisit','archive','rejected'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member','reviewer','admin')),
  created_at timestamptz not null default now()
);

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  location text,
  bio text,
  created_at timestamptz not null default now()
);

create table public.artworks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
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

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  artwork_id uuid not null unique references public.artworks(id) on delete cascade,
  status public.submission_status not null default 'received',
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

create table public.submission_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.submission_status_history (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  old_status public.submission_status,
  new_status public.submission_status not null,
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
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','reviewer')
  );
$$;

create or replace function public.touch_submission_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger submissions_touch_updated_at
before update on public.submissions
for each row execute function public.touch_submission_updated_at();

create or replace function public.log_submission_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.submission_status_history(submission_id, old_status, new_status, changed_by)
    values(new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger submissions_status_history
after update on public.submissions
for each row execute function public.log_submission_status_change();

alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.artworks enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_images enable row level security;
alter table public.submission_status_history enable row level security;

create policy "profiles_read_self" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "admins_read_artists" on public.artists
for select to authenticated using (public.is_darft_admin());
create policy "admins_update_artists" on public.artists
for update to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

create policy "public_read_selected_artworks" on public.artworks
for select to anon, authenticated using (is_public = true);
create policy "admins_all_artworks" on public.artworks
for all to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

create policy "admins_read_submissions" on public.submissions
for select to authenticated using (public.is_darft_admin());
create policy "admins_update_submissions" on public.submissions
for update to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

create policy "admins_read_submission_images" on public.submission_images
for select to authenticated using (public.is_darft_admin());
create policy "admins_read_status_history" on public.submission_status_history
for select to authenticated using (public.is_darft_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-images','submission-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "darft_team_read_submission_files" on storage.objects
for select to authenticated using (bucket_id = 'submission-images' and public.is_darft_admin());

create or replace view public.submissions_admin
with (security_invoker = true)
as
select
  s.id,
  s.reference,
  s.status,
  s.archive_consent,
  s.rights_confirmed,
  s.review_positive,
  s.review_reserve,
  s.review_message,
  s.reviewed_at,
  s.created_at,
  a.id as artist_id,
  a.name as artist_name,
  a.email,
  a.phone,
  a.location,
  a.bio as artist_bio,
  w.id as artwork_id,
  w.title,
  w.year,
  w.medium,
  w.dimensions,
  w.price_eur,
  w.availability,
  w.story,
  w.process
from public.submissions s
join public.artworks w on w.id = s.artwork_id
join public.artists a on a.id = w.artist_id;

grant select on public.submissions_admin to authenticated;

comment on view public.submissions_admin is 'Admin review surface for DARFT submissions; underlying RLS is enforced through security_invoker.';
