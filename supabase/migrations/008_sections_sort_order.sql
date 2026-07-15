-- 007 created public.sections with sort_order via CREATE TABLE IF NOT EXISTS. If a
-- "sections" table already existed in the database beforehand (without that column),
-- the IF NOT EXISTS guard silently skipped table creation and sort_order was never
-- added, causing "column sections.sort_order does not exist" wherever the basic-data
-- and teacher-assignments pages order/select by it.

ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
