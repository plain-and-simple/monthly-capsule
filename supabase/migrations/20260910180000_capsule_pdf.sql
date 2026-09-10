-- Durable PDF keepsake per compiled capsule (letters + photos).
-- Stored in the private capsule-photos bucket; path recorded on capsules.

alter table public.capsules
  add column if not exists pdf_storage_path text;

comment on column public.capsules.pdf_storage_path is
  'Private Storage path for the compiled PDF keepsake, or null until generated.';

-- Allow PDF objects alongside photo MIME types in the existing private bucket.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'capsule-photos';
