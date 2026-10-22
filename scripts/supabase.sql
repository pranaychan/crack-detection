-- Run once in the Supabase SQL editor (free tier is enough).
-- Private bucket for collected images.
insert into storage.buckets (id, name, public)
values ('inspection-images', 'inspection-images', false)
on conflict (id) do nothing;

-- One row per uploaded image. RLS is on with no policies, so only the server's
-- service key can read or write it.
create table if not exists public.inspections (
  id uuid primary key,
  image_path text not null,
  defect text not null,
  created_at timestamptz not null default now()
);
alter table public.inspections enable row level security;
