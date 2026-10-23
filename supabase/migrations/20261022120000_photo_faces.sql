-- Optional face boxes from the browser FaceDetector at upload.
-- Null means the PDF trims evenly. Not a user-visible submit field.
alter table public.photos add column if not exists faces jsonb;
