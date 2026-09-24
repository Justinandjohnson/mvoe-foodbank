-- Add normalized, queryable availability windows without changing the raw hours
-- retained on food_bank_directory_entries. Unknown schedules intentionally have no rows.

ALTER TYPE "VenueType" ADD VALUE IF NOT EXISTS 'pop_up';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvailabilityWindowKind') THEN
    CREATE TYPE "AvailabilityWindowKind" AS ENUM ('recurring', 'date_specific');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "food_bank_availability_windows" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "kind" "AvailabilityWindowKind" NOT NULL,
  "category" "VenueType" NOT NULL,
  "day_of_week" INTEGER,
  "specific_date" DATE,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
  "recurrence_ordinal" INTEGER,
  "source_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "food_bank_availability_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "food_availability_time_check"
    CHECK (
      "start_minute" BETWEEN 0 AND 1439
      AND "end_minute" BETWEEN 1 AND 1440
      AND "end_minute" > "start_minute"
    ),
  CONSTRAINT "food_availability_shape_check"
    CHECK (
      (
        "kind" = 'recurring'
        AND "day_of_week" BETWEEN 0 AND 6
        AND "specific_date" IS NULL
        AND ("recurrence_ordinal" IS NULL OR "recurrence_ordinal" BETWEEN 1 AND 5)
      )
      OR
      (
        "kind" = 'date_specific'
        AND "day_of_week" IS NULL
        AND "specific_date" IS NOT NULL
        AND "recurrence_ordinal" IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS "food_availability_entry_idx"
  ON "food_bank_availability_windows"("entry_id");

CREATE INDEX IF NOT EXISTS "food_availability_recurring_idx"
  ON "food_bank_availability_windows"("kind", "category", "day_of_week", "start_minute", "end_minute");

CREATE INDEX IF NOT EXISTS "food_availability_date_idx"
  ON "food_bank_availability_windows"("kind", "specific_date", "category", "start_minute", "end_minute");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_bank_availability_windows_entry_id_fkey'
  ) THEN
    ALTER TABLE "food_bank_availability_windows"
      ADD CONSTRAINT "food_bank_availability_windows_entry_id_fkey"
      FOREIGN KEY ("entry_id") REFERENCES "food_bank_directory_entries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "food_bank_availability_windows" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'food_bank_availability_windows'
      AND policyname = 'food_availability_public_select'
  ) THEN
    CREATE POLICY "food_availability_public_select"
      ON "food_bank_availability_windows"
      FOR SELECT
      TO public
      USING (
        EXISTS (
          SELECT 1
          FROM "food_bank_directory_entries" parent
          WHERE parent."id" = "food_bank_availability_windows"."entry_id"
            AND parent."discovery_status" = 'indexed'
            AND parent."review_status" IN ('auto_applied', 'approved')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE "food_bank_availability_windows" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON TABLE "food_bank_availability_windows" TO authenticated;
  END IF;
END $$;
