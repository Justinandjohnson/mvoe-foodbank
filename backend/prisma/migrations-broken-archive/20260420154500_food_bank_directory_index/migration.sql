CREATE TABLE "food_bank_index_regions" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'US',
  "search_queries" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_run_at" TIMESTAMP(3),
  "next_run_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "food_bank_index_regions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_bank_index_runs" (
  "id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "run_type" TEXT NOT NULL DEFAULT 'weekly_sync',
  "job_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "discovered_count" INTEGER NOT NULL DEFAULT 0,
  "new_count" INTEGER NOT NULL DEFAULT 0,
  "changed_count" INTEGER NOT NULL DEFAULT 0,
  "auto_applied_count" INTEGER NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "food_bank_index_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_bank_directory_entries" (
  "id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "canonical_name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source_url" TEXT,
  "source_domain" TEXT,
  "website" TEXT,
  "website_domain" TEXT,
  "phone" TEXT,
  "normalized_phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zip_code" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "hours" TEXT,
  "description" TEXT,
  "eligibility_notes" TEXT,
  "discovery_status" TEXT NOT NULL DEFAULT 'indexed',
  "review_status" TEXT NOT NULL DEFAULT 'pending',
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_verified_at" TIMESTAMP(3),
  "next_review_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "food_bank_directory_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_bank_directory_changes" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "run_id" TEXT,
  "change_type" TEXT NOT NULL,
  "changed_fields" TEXT[],
  "previous_data" JSONB,
  "next_data" JSONB,
  "review_status" TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "food_bank_directory_changes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_bank_source_records" (
  "id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "run_id" TEXT,
  "entry_id" TEXT,
  "query" TEXT,
  "title" TEXT,
  "url" TEXT NOT NULL,
  "domain" TEXT,
  "snippet" TEXT,
  "content_hash" TEXT,
  "extracted_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "food_bank_source_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_bank_index_regions_city_state_country_key"
ON "food_bank_index_regions"("city", "state", "country");

CREATE INDEX "food_bank_index_regions_is_active_next_run_at_idx"
ON "food_bank_index_regions"("is_active", "next_run_at");

CREATE INDEX "food_bank_index_runs_region_id_created_at_idx"
ON "food_bank_index_runs"("region_id", "created_at" DESC);

CREATE INDEX "food_bank_index_runs_status_idx"
ON "food_bank_index_runs"("status");

CREATE UNIQUE INDEX "food_bank_directory_entries_organization_id_key"
ON "food_bank_directory_entries"("organization_id");

CREATE UNIQUE INDEX "food_bank_directory_entries_fingerprint_key"
ON "food_bank_directory_entries"("fingerprint");

CREATE INDEX "food_bank_directory_entries_region_id_idx"
ON "food_bank_directory_entries"("region_id");

CREATE INDEX "food_bank_directory_entries_discovery_status_review_status_idx"
ON "food_bank_directory_entries"("discovery_status", "review_status");

CREATE INDEX "food_bank_directory_entries_next_review_at_idx"
ON "food_bank_directory_entries"("next_review_at");

CREATE INDEX "food_bank_directory_entries_website_domain_idx"
ON "food_bank_directory_entries"("website_domain");

CREATE INDEX "food_bank_directory_entries_normalized_phone_idx"
ON "food_bank_directory_entries"("normalized_phone");

CREATE INDEX "food_bank_directory_changes_entry_id_created_at_idx"
ON "food_bank_directory_changes"("entry_id", "created_at" DESC);

CREATE INDEX "food_bank_directory_changes_review_status_created_at_idx"
ON "food_bank_directory_changes"("review_status", "created_at" DESC);

CREATE INDEX "food_bank_source_records_region_id_created_at_idx"
ON "food_bank_source_records"("region_id", "created_at" DESC);

CREATE INDEX "food_bank_source_records_url_idx"
ON "food_bank_source_records"("url");

CREATE INDEX "food_bank_source_records_content_hash_idx"
ON "food_bank_source_records"("content_hash");

ALTER TABLE "food_bank_index_runs"
ADD CONSTRAINT "food_bank_index_runs_region_id_fkey"
FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_bank_directory_entries"
ADD CONSTRAINT "food_bank_directory_entries_region_id_fkey"
FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_bank_directory_entries"
ADD CONSTRAINT "food_bank_directory_entries_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_bank_directory_changes"
ADD CONSTRAINT "food_bank_directory_changes_entry_id_fkey"
FOREIGN KEY ("entry_id") REFERENCES "food_bank_directory_entries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_bank_directory_changes"
ADD CONSTRAINT "food_bank_directory_changes_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "food_bank_index_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_bank_source_records"
ADD CONSTRAINT "food_bank_source_records_region_id_fkey"
FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "food_bank_source_records"
ADD CONSTRAINT "food_bank_source_records_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "food_bank_index_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_bank_source_records"
ADD CONSTRAINT "food_bank_source_records_entry_id_fkey"
FOREIGN KEY ("entry_id") REFERENCES "food_bank_directory_entries"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
