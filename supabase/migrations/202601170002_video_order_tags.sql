-- Add ordering and tags to videos
alter table public.videos
  add column if not exists order_index integer,
  add column if not exists tags text[] default '{}'::text[];

create index if not exists idx_videos_order_index on public.videos (order_index);
