-- Add the freshness/provenance columns and source configuration table used by
-- the food-bank directory map. Data import/backfill remains separate.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VenueType') THEN
    CREATE TYPE "VenueType" AS ENUM (
      'food_bank',
      'pantry',
      'community_fridge',
      'meal',
      'program',
      'event'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EntryOrigin') THEN
    CREATE TYPE "EntryOrigin" AS ENUM (
      'scraped',
      'partner',
      'user_beacon'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SourceMatchStatus') THEN
    CREATE TYPE "SourceMatchStatus" AS ENUM (
      'matched',
      'unmatched',
      'ignored'
    );
  END IF;
END $$;

ALTER TABLE "food_bank_index_regions"
  ADD COLUMN IF NOT EXISTS "config" JSONB;

ALTER TABLE "food_bank_directory_entries"
  ADD COLUMN IF NOT EXISTS "venue_type" "VenueType" NOT NULL DEFAULT 'food_bank',
  ADD COLUMN IF NOT EXISTS "origin" "EntryOrigin" NOT NULL DEFAULT 'scraped',
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "source_priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "normalized_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "disappeared_at" TIMESTAMP(3);

ALTER TABLE "food_bank_source_records"
  ADD COLUMN IF NOT EXISTS "match_status" "SourceMatchStatus" NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS "normalized_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "food_bank_sources" (
  "id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "quality_tier" INTEGER NOT NULL DEFAULT 3,
  "authority" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "region_id" TEXT,
  "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "food_bank_sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "food_bank_directory_entries_region_id_latitude_longitude_idx"
  ON "food_bank_directory_entries"("region_id", "latitude", "longitude");

CREATE INDEX IF NOT EXISTS "food_bank_directory_entries_region_id_first_seen_at_idx"
  ON "food_bank_directory_entries"("region_id", "first_seen_at" DESC);

CREATE INDEX IF NOT EXISTS "food_bank_directory_entries_region_id_origin_venue_type_discovery_status_idx"
  ON "food_bank_directory_entries"("region_id", "origin", "venue_type", "discovery_status");

CREATE INDEX IF NOT EXISTS "food_bank_directory_entries_normalized_fingerprint_idx"
  ON "food_bank_directory_entries"("normalized_fingerprint");

CREATE INDEX IF NOT EXISTS "food_bank_source_records_normalized_fingerprint_idx"
  ON "food_bank_source_records"("normalized_fingerprint");

CREATE INDEX IF NOT EXISTS "food_bank_source_records_match_status_idx"
  ON "food_bank_source_records"("match_status");

CREATE UNIQUE INDEX IF NOT EXISTS "food_bank_sources_domain_key"
  ON "food_bank_sources"("domain");

CREATE INDEX IF NOT EXISTS "food_bank_sources_enabled_quality_tier_idx"
  ON "food_bank_sources"("enabled", "quality_tier");

CREATE INDEX IF NOT EXISTS "food_bank_sources_region_id_idx"
  ON "food_bank_sources"("region_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_bank_sources_region_id_fkey'
  ) THEN
    ALTER TABLE "food_bank_sources"
      ADD CONSTRAINT "food_bank_sources_region_id_fkey"
      FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "food_bank_index_regions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_bank_directory_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "food_bank_sources" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'food_bank_index_regions'
      AND policyname = 'food_bank_index_regions_public_select'
  ) THEN
    CREATE POLICY "food_bank_index_regions_public_select"
      ON "food_bank_index_regions"
      FOR SELECT
      TO public
      USING ("is_active" = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'food_bank_directory_entries'
      AND policyname = 'food_bank_directory_entries_public_select'
  ) THEN
    CREATE POLICY "food_bank_directory_entries_public_select"
      ON "food_bank_directory_entries"
      FOR SELECT
      TO public
      USING (
        "discovery_status" = 'indexed'
        AND "review_status" IN ('auto_applied', 'approved')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'food_bank_sources'
      AND policyname = 'food_bank_sources_public_select'
  ) THEN
    CREATE POLICY "food_bank_sources_public_select"
      ON "food_bank_sources"
      FOR SELECT
      TO public
      USING ("enabled" = true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT ON TABLE
      "food_bank_index_regions",
      "food_bank_directory_entries",
      "food_bank_sources"
      TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON TABLE
      "food_bank_index_regions",
      "food_bank_directory_entries",
      "food_bank_sources"
      TO authenticated;
  END IF;
END $$;
