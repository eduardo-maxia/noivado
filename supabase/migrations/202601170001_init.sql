-- Extensions
create extension if not exists "pgcrypto";

-- Tables
create table if not exists public.contributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relation text,
  session_id text not null,
  user_agent text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.contributors(id) on delete cascade,
  storage_path text not null,
  duration integer,
  is_vertical boolean,
  has_note boolean default false,
  created_at timestamptz not null default now(),
  selected boolean default false,
  favorite boolean default false
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_videos_created_at on public.videos (created_at desc);
create index if not exists idx_notes_video_id on public.notes (video_id);

-- Row Level Security
alter table public.contributors enable row level security;
alter table public.videos enable row level security;
alter table public.notes enable row level security;

create policy "contributors_insert" on public.contributors
for insert to anon
with check (true);

create policy "videos_insert" on public.videos
for insert to anon
with check (true);

create policy "notes_insert" on public.notes
for insert to anon
with check (true);

create policy "contributors_no_select" on public.contributors
for select to anon
using (false);

create policy "videos_no_select" on public.videos
for select to anon
using (false);

create policy "notes_no_select" on public.notes
for select to anon
using (false);

-- Admin toggles (favorite/selected)
create policy "videos_update_admin" on public.videos
for update to anon
using (true)
with check (true);

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('videos_noivado', 'videos_noivado', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

create policy "storage_insert_videos" on storage.objects
for insert to anon
with check (bucket_id = 'videos_noivado');

create policy "storage_no_select" on storage.objects
for select to anon
using (false);
