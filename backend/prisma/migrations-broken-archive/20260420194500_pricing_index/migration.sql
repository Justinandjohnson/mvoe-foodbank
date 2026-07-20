CREATE TABLE "pricing_catalog_items" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "category" TEXT,
  "aliases" JSONB,
  "default_search_term" TEXT NOT NULL,
  "store_search_terms" JSONB,
  "is_staple" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_indexed_at" TIMESTAMP(3),
  "next_refresh_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pricing_catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pricing_snapshots" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "store" TEXT NOT NULL,
  "store_query" TEXT NOT NULL,
  "product_name" TEXT,
  "product_url" TEXT,
  "source_url" TEXT,
  "package_label" TEXT,
  "price" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "availability" TEXT NOT NULL DEFAULT 'unknown',
  "freshness" TEXT NOT NULL DEFAULT 'fresh',
  "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pricing_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pricing_sync_runs" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'catalog',
  "trigger" TEXT NOT NULL DEFAULT 'scheduler',
  "status" TEXT NOT NULL DEFAULT 'running',
  "requested_by" TEXT,
  "item_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pricing_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_catalog_items_slug_key"
ON "pricing_catalog_items"("slug");

CREATE INDEX "pricing_catalog_items_is_active_is_staple_next_refresh_at_idx"
ON "pricing_catalog_items"("is_active", "is_staple", "next_refresh_at");

CREATE INDEX "pricing_catalog_items_normalized_name_idx"
ON "pricing_catalog_items"("normalized_name");

CREATE UNIQUE INDEX "pricing_snapshots_item_id_store_key"
ON "pricing_snapshots"("item_id", "store");

CREATE INDEX "pricing_snapshots_store_scraped_at_idx"
ON "pricing_snapshots"("store", "scraped_at" DESC);

CREATE INDEX "pricing_snapshots_freshness_expires_at_idx"
ON "pricing_snapshots"("freshness", "expires_at");

CREATE INDEX "pricing_sync_runs_status_created_at_idx"
ON "pricing_sync_runs"("status", "created_at" DESC);

CREATE INDEX "pricing_sync_runs_scope_created_at_idx"
ON "pricing_sync_runs"("scope", "created_at" DESC);

ALTER TABLE "pricing_snapshots"
ADD CONSTRAINT "pricing_snapshots_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "pricing_catalog_items"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
