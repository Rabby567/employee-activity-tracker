
-- ============================================================
-- ActivityTrack: Agent Screenshot Controls
-- Migration: 20261112000200
-- Database: Employee-activity
-- ============================================================

BEGIN;

-- 1. Add screenshot control columns to employees
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS screenshot_enabled
        BOOLEAN NOT NULL DEFAULT FALSE,

    ADD COLUMN IF NOT EXISTS screenshot_interval
        INTEGER NOT NULL DEFAULT 300,

    ADD COLUMN IF NOT EXISTS capture_requested_at
        TIMESTAMPTZ;

-- 2. Validate screenshot interval
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'employees_screenshot_interval_check'
          AND conrelid = 'public.employees'::regclass
    ) THEN
        ALTER TABLE public.employees
            ADD CONSTRAINT employees_screenshot_interval_check
            CHECK (screenshot_interval BETWEEN 60 AND 3600);
    END IF;
END
$$;

-- 3. Add column descriptions
COMMENT ON COLUMN public.employees.screenshot_enabled IS
    'Admin-controlled screenshot monitoring switch.';

COMMENT ON COLUMN public.employees.screenshot_interval IS
    'Admin-controlled screenshot interval in seconds. Default 300 seconds.';

COMMENT ON COLUMN public.employees.capture_requested_at IS
    'Timestamp changed by admin to request one immediate screenshot.';

-- 4. Index for finding enabled screenshot monitoring employees
CREATE INDEX IF NOT EXISTS idx_employees_screenshot_enabled
ON public.employees (screenshot_enabled)
WHERE screenshot_enabled = TRUE;

COMMIT;

-- ============================================================
-- Migration completed
-- ============================================================
