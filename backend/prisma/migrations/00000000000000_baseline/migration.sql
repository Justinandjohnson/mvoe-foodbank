-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "user_type" TEXT NOT NULL DEFAULT 'donor',
    "visibility_preference" TEXT NOT NULL DEFAULT 'first_name',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'food_bank',
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "stripe_account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "hours" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "donor_id" TEXT,
    "organization_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "stripe_charge_id" TEXT NOT NULL,
    "stripe_payment_intent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurring_interval" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "receipt_url" TEXT,
    "tax_receipt_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "donation_id" TEXT,
    "organization_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "balance_cents" INTEGER NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "vendor" TEXT,
    "receipt_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_reports" (
    "id" TEXT NOT NULL,
    "reporter_user_id" TEXT,
    "reporter_session_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "metadata" JSONB,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "permissions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_bank_status" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "wait_time_minutes" INTEGER,
    "food_available" TEXT DEFAULT 'unknown',
    "capacity_percentage" INTEGER,
    "notes" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "food_bank_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_needs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT,
    "is_fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "meal_name" TEXT NOT NULL,
    "meal_date" TIMESTAMP(3) NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_shifts" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "volunteer_id" TEXT,
    "shift_type" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "volunteer_id" TEXT,
    "recipient_name" TEXT,
    "recipient_address" TEXT NOT NULL,
    "recipient_phone" TEXT,
    "delivery_time" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_events" (
    "id" TEXT NOT NULL,
    "organizer_id" TEXT,
    "organizer_session_id" TEXT,
    "event_name" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'community_meal',
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "target_servings" INTEGER NOT NULL,
    "budget_cents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "max_volunteers" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_beacons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Food available',
    "description" TEXT,
    "location_label" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "quantity_level" TEXT NOT NULL DEFAULT 'some',
    "food_types" TEXT,
    "photo_url" TEXT,
    "available_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_beacons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "event_volunteers" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "volunteer_id" TEXT,
    "volunteer_session_id" TEXT,
    "volunteer_type" TEXT NOT NULL,
    "capacity_offered" INTEGER,
    "available_from" TIMESTAMP(3),
    "available_to" TIMESTAMP(3),
    "special_skills" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_volunteers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_resources" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "provider_session_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_name" TEXT NOT NULL,
    "quantity" TEXT,
    "capacity" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_meal_plans" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "menu_items" JSONB NOT NULL,
    "shopping_list" JSONB NOT NULL,
    "nutrition_analysis" JSONB,
    "allergen_info" JSONB,
    "cooking_timeline" JSONB,
    "total_cost_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_dietary_profiles" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "allergies" TEXT[],
    "dietary_restrictions" TEXT[],
    "preferences" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_dietary_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_category_id" TEXT,
    "color_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detailed_expenses" (
    "id" TEXT NOT NULL,
    "ledger_entry_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "receipt_url" TEXT,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detailed_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_metrics" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "period" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "impact_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_photos" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ledger_entry_id" TEXT,
    "expense_id" TEXT,
    "photo_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "original_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "amount_cents" INTEGER,
    "expense_date" TIMESTAMP(3),
    "tags" TEXT[],
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_data_cache" (
    "id" TEXT NOT NULL,
    "usda_fdc_id" TEXT NOT NULL,
    "food_name" TEXT NOT NULL,
    "nutrition_data" JSONB NOT NULL,
    "allergen_data" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nutrition_data_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_workspaces" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_session_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New grant chat',
    "status" TEXT NOT NULL DEFAULT 'active',
    "organization_name" TEXT NOT NULL DEFAULT 'MVOE',
    "mission" TEXT,
    "location" TEXT,
    "population_served" TEXT,
    "project_need" TEXT,
    "amount_target" TEXT,
    "grant_type" TEXT,
    "website_url" TEXT,
    "social_url" TEXT,
    "existing_programs" TEXT,
    "notes" TEXT,
    "selected_opportunity" JSONB,
    "last_run_mode" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grant_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_workspace_messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "content" TEXT NOT NULL,
    "mode" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_workspace_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_application_drafts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_message_id" TEXT,
    "artifact_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "drive_file_id" TEXT,
    "drive_file_url" TEXT,
    "drive_file_name" TEXT,
    "drive_synced_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grant_application_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_workspace_drive_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'composio',
    "toolkit_slug" TEXT NOT NULL DEFAULT 'googledrive',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "connection_request_id" TEXT,
    "connected_account_id" TEXT,
    "redirect_url" TEXT,
    "connected_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grant_workspace_drive_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_drive_syncs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "draft_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'google_drive',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_id" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3),

    CONSTRAINT "grant_drive_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_images" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_account_id_key" ON "organizations"("stripe_account_id");

-- CreateIndex
CREATE INDEX "organizations_latitude_longitude_idx" ON "organizations"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "donations_stripe_charge_id_key" ON "donations"("stripe_charge_id");

-- CreateIndex
CREATE INDEX "donations_donor_id_idx" ON "donations"("donor_id");

-- CreateIndex
CREATE INDEX "donations_organization_id_idx" ON "donations"("organization_id");

-- CreateIndex
CREATE INDEX "donations_created_at_idx" ON "donations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "donations_status_idx" ON "donations"("status");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_idx" ON "ledger_entries"("organization_id");

-- CreateIndex
CREATE INDEX "ledger_entries_created_at_idx" ON "ledger_entries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_entries_entry_type_idx" ON "ledger_entries"("entry_type");

-- CreateIndex
CREATE INDEX "ledger_entries_category_idx" ON "ledger_entries"("category");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_reports_entity_type_entity_id_idx" ON "moderation_reports"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "moderation_reports_status_severity_created_at_idx" ON "moderation_reports"("status", "severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_reports_reporter_user_id_idx" ON "moderation_reports"("reporter_user_id");

-- CreateIndex
CREATE INDEX "moderation_reports_reporter_session_id_idx" ON "moderation_reports"("reporter_session_id");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "organization_members_organization_id_idx" ON "organization_members"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_user_id_organization_id_key" ON "organization_members"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_bank_status_organization_id_key" ON "food_bank_status"("organization_id");

-- CreateIndex
CREATE INDEX "food_bank_status_organization_id_idx" ON "food_bank_status"("organization_id");

-- CreateIndex
CREATE INDEX "food_bank_status_last_updated_idx" ON "food_bank_status"("last_updated");

-- CreateIndex
CREATE INDEX "food_needs_organization_id_idx" ON "food_needs"("organization_id");

-- CreateIndex
CREATE INDEX "food_needs_priority_idx" ON "food_needs"("priority");

-- CreateIndex
CREATE INDEX "food_needs_is_fulfilled_idx" ON "food_needs"("is_fulfilled");

-- CreateIndex
CREATE INDEX "meals_organization_id_idx" ON "meals"("organization_id");

-- CreateIndex
CREATE INDEX "meals_meal_date_idx" ON "meals"("meal_date");

-- CreateIndex
CREATE INDEX "meals_status_idx" ON "meals"("status");

-- CreateIndex
CREATE INDEX "volunteer_shifts_meal_id_idx" ON "volunteer_shifts"("meal_id");

-- CreateIndex
CREATE INDEX "volunteer_shifts_volunteer_id_idx" ON "volunteer_shifts"("volunteer_id");

-- CreateIndex
CREATE INDEX "volunteer_shifts_shift_type_idx" ON "volunteer_shifts"("shift_type");

-- CreateIndex
CREATE INDEX "volunteer_shifts_status_idx" ON "volunteer_shifts"("status");

-- CreateIndex
CREATE INDEX "deliveries_meal_id_idx" ON "deliveries"("meal_id");

-- CreateIndex
CREATE INDEX "deliveries_volunteer_id_idx" ON "deliveries"("volunteer_id");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE INDEX "deliveries_delivery_time_idx" ON "deliveries"("delivery_time");

-- CreateIndex
CREATE INDEX "community_events_organizer_id_idx" ON "community_events"("organizer_id");

-- CreateIndex
CREATE INDEX "community_events_organizer_session_id_idx" ON "community_events"("organizer_session_id");

-- CreateIndex
CREATE INDEX "community_events_event_date_idx" ON "community_events"("event_date");

-- CreateIndex
CREATE INDEX "community_events_status_idx" ON "community_events"("status");

-- CreateIndex
CREATE INDEX "community_events_is_public_idx" ON "community_events"("is_public");

-- CreateIndex
CREATE INDEX "community_events_latitude_longitude_idx" ON "community_events"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "food_beacons_user_id_key" ON "food_beacons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_beacons_session_id_key" ON "food_beacons"("session_id");

-- CreateIndex
CREATE INDEX "food_beacons_is_active_is_public_idx" ON "food_beacons"("is_active", "is_public");

-- CreateIndex
CREATE INDEX "food_beacons_latitude_longitude_idx" ON "food_beacons"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "food_bank_index_regions_is_active_next_run_at_idx" ON "food_bank_index_regions"("is_active", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "food_bank_index_regions_city_state_country_key" ON "food_bank_index_regions"("city", "state", "country");

-- CreateIndex
CREATE INDEX "food_bank_index_runs_region_id_created_at_idx" ON "food_bank_index_runs"("region_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "food_bank_index_runs_status_idx" ON "food_bank_index_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "food_bank_directory_entries_organization_id_key" ON "food_bank_directory_entries"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_bank_directory_entries_fingerprint_key" ON "food_bank_directory_entries"("fingerprint");

-- CreateIndex
CREATE INDEX "food_bank_directory_entries_region_id_idx" ON "food_bank_directory_entries"("region_id");

-- CreateIndex
CREATE INDEX "food_bank_directory_entries_discovery_status_review_status_idx" ON "food_bank_directory_entries"("discovery_status", "review_status");

-- CreateIndex
CREATE INDEX "food_bank_directory_entries_next_review_at_idx" ON "food_bank_directory_entries"("next_review_at");

-- CreateIndex
CREATE INDEX "food_bank_directory_entries_website_domain_idx" ON "food_bank_directory_entries"("website_domain");

-- CreateIndex
CREATE INDEX "food_bank_directory_entries_normalized_phone_idx" ON "food_bank_directory_entries"("normalized_phone");

-- CreateIndex
CREATE INDEX "food_bank_directory_changes_entry_id_created_at_idx" ON "food_bank_directory_changes"("entry_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "food_bank_directory_changes_review_status_created_at_idx" ON "food_bank_directory_changes"("review_status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "food_bank_source_records_region_id_created_at_idx" ON "food_bank_source_records"("region_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "food_bank_source_records_url_idx" ON "food_bank_source_records"("url");

-- CreateIndex
CREATE INDEX "food_bank_source_records_content_hash_idx" ON "food_bank_source_records"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_catalog_items_slug_key" ON "pricing_catalog_items"("slug");

-- CreateIndex
CREATE INDEX "pricing_catalog_items_is_active_is_staple_next_refresh_at_idx" ON "pricing_catalog_items"("is_active", "is_staple", "next_refresh_at");

-- CreateIndex
CREATE INDEX "pricing_catalog_items_normalized_name_idx" ON "pricing_catalog_items"("normalized_name");

-- CreateIndex
CREATE INDEX "pricing_snapshots_store_scraped_at_idx" ON "pricing_snapshots"("store", "scraped_at" DESC);

-- CreateIndex
CREATE INDEX "pricing_snapshots_freshness_expires_at_idx" ON "pricing_snapshots"("freshness", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_snapshots_item_id_store_key" ON "pricing_snapshots"("item_id", "store");

-- CreateIndex
CREATE INDEX "pricing_sync_runs_status_created_at_idx" ON "pricing_sync_runs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pricing_sync_runs_scope_created_at_idx" ON "pricing_sync_runs"("scope", "created_at" DESC);

-- CreateIndex
CREATE INDEX "event_volunteers_event_id_idx" ON "event_volunteers"("event_id");

-- CreateIndex
CREATE INDEX "event_volunteers_volunteer_id_idx" ON "event_volunteers"("volunteer_id");

-- CreateIndex
CREATE INDEX "event_volunteers_volunteer_session_id_idx" ON "event_volunteers"("volunteer_session_id");

-- CreateIndex
CREATE INDEX "event_volunteers_volunteer_type_idx" ON "event_volunteers"("volunteer_type");

-- CreateIndex
CREATE UNIQUE INDEX "event_volunteers_event_id_volunteer_id_key" ON "event_volunteers"("event_id", "volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_volunteers_event_id_volunteer_session_id_key" ON "event_volunteers"("event_id", "volunteer_session_id");

-- CreateIndex
CREATE INDEX "event_resources_event_id_idx" ON "event_resources"("event_id");

-- CreateIndex
CREATE INDEX "event_resources_provider_id_idx" ON "event_resources"("provider_id");

-- CreateIndex
CREATE INDEX "event_resources_provider_session_id_idx" ON "event_resources"("provider_session_id");

-- CreateIndex
CREATE INDEX "event_resources_resource_type_idx" ON "event_resources"("resource_type");

-- CreateIndex
CREATE UNIQUE INDEX "event_meal_plans_event_id_key" ON "event_meal_plans"("event_id");

-- CreateIndex
CREATE INDEX "event_dietary_profiles_event_id_idx" ON "event_dietary_profiles"("event_id");

-- CreateIndex
CREATE INDEX "event_dietary_profiles_user_id_idx" ON "event_dietary_profiles"("user_id");

-- CreateIndex
CREATE INDEX "event_dietary_profiles_session_id_idx" ON "event_dietary_profiles"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_dietary_profiles_event_id_user_id_key" ON "event_dietary_profiles"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_dietary_profiles_event_id_session_id_key" ON "event_dietary_profiles"("event_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "expense_categories_parent_category_id_idx" ON "expense_categories"("parent_category_id");

-- CreateIndex
CREATE INDEX "detailed_expenses_ledger_entry_id_idx" ON "detailed_expenses"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "detailed_expenses_category_id_idx" ON "detailed_expenses"("category_id");

-- CreateIndex
CREATE INDEX "detailed_expenses_vendor_idx" ON "detailed_expenses"("vendor");

-- CreateIndex
CREATE INDEX "impact_metrics_organization_id_idx" ON "impact_metrics"("organization_id");

-- CreateIndex
CREATE INDEX "impact_metrics_metric_type_idx" ON "impact_metrics"("metric_type");

-- CreateIndex
CREATE INDEX "impact_metrics_period_idx" ON "impact_metrics"("period");

-- CreateIndex
CREATE INDEX "impact_metrics_calculated_at_idx" ON "impact_metrics"("calculated_at");

-- CreateIndex
CREATE UNIQUE INDEX "impact_metrics_organization_id_metric_type_period_period_st_key" ON "impact_metrics"("organization_id", "metric_type", "period", "period_start");

-- CreateIndex
CREATE INDEX "receipt_photos_organization_id_idx" ON "receipt_photos"("organization_id");

-- CreateIndex
CREATE INDEX "receipt_photos_ledger_entry_id_idx" ON "receipt_photos"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "receipt_photos_expense_id_idx" ON "receipt_photos"("expense_id");

-- CreateIndex
CREATE INDEX "receipt_photos_created_at_idx" ON "receipt_photos"("created_at" DESC);

-- CreateIndex
CREATE INDEX "receipt_photos_is_public_idx" ON "receipt_photos"("is_public");

-- CreateIndex
CREATE INDEX "receipt_photos_vendor_idx" ON "receipt_photos"("vendor");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_data_cache_usda_fdc_id_key" ON "nutrition_data_cache"("usda_fdc_id");

-- CreateIndex
CREATE INDEX "nutrition_data_cache_food_name_idx" ON "nutrition_data_cache"("food_name");

-- CreateIndex
CREATE INDEX "grant_workspaces_actor_user_id_idx" ON "grant_workspaces"("actor_user_id");

-- CreateIndex
CREATE INDEX "grant_workspaces_actor_session_id_idx" ON "grant_workspaces"("actor_session_id");

-- CreateIndex
CREATE INDEX "grant_workspaces_last_activity_at_idx" ON "grant_workspaces"("last_activity_at" DESC);

-- CreateIndex
CREATE INDEX "grant_workspace_messages_workspace_id_created_at_idx" ON "grant_workspace_messages"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "grant_workspace_messages_role_idx" ON "grant_workspace_messages"("role");

-- CreateIndex
CREATE INDEX "grant_application_drafts_workspace_id_created_at_idx" ON "grant_application_drafts"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "grant_application_drafts_status_idx" ON "grant_application_drafts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "grant_workspace_drive_connections_workspace_id_key" ON "grant_workspace_drive_connections"("workspace_id");

-- CreateIndex
CREATE INDEX "grant_workspace_drive_connections_status_idx" ON "grant_workspace_drive_connections"("status");

-- CreateIndex
CREATE INDEX "grant_drive_syncs_workspace_id_created_at_idx" ON "grant_drive_syncs"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "grant_drive_syncs_status_idx" ON "grant_drive_syncs"("status");

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_status" ADD CONSTRAINT "food_bank_status_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_needs" ADD CONSTRAINT "food_needs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_shifts" ADD CONSTRAINT "volunteer_shifts_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_beacons" ADD CONSTRAINT "food_beacons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_index_runs" ADD CONSTRAINT "food_bank_index_runs_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_directory_entries" ADD CONSTRAINT "food_bank_directory_entries_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_directory_entries" ADD CONSTRAINT "food_bank_directory_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_directory_changes" ADD CONSTRAINT "food_bank_directory_changes_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "food_bank_directory_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_directory_changes" ADD CONSTRAINT "food_bank_directory_changes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "food_bank_index_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_source_records" ADD CONSTRAINT "food_bank_source_records_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "food_bank_index_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_source_records" ADD CONSTRAINT "food_bank_source_records_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "food_bank_index_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bank_source_records" ADD CONSTRAINT "food_bank_source_records_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "food_bank_directory_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_snapshots" ADD CONSTRAINT "pricing_snapshots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "pricing_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_volunteers" ADD CONSTRAINT "event_volunteers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "community_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_resources" ADD CONSTRAINT "event_resources_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "community_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_meal_plans" ADD CONSTRAINT "event_meal_plans_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "community_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_dietary_profiles" ADD CONSTRAINT "event_dietary_profiles_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "community_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detailed_expenses" ADD CONSTRAINT "detailed_expenses_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detailed_expenses" ADD CONSTRAINT "detailed_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_metrics" ADD CONSTRAINT "impact_metrics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_photos" ADD CONSTRAINT "receipt_photos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_photos" ADD CONSTRAINT "receipt_photos_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_photos" ADD CONSTRAINT "receipt_photos_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "detailed_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_workspaces" ADD CONSTRAINT "grant_workspaces_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_workspace_messages" ADD CONSTRAINT "grant_workspace_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "grant_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_application_drafts" ADD CONSTRAINT "grant_application_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "grant_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_application_drafts" ADD CONSTRAINT "grant_application_drafts_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "grant_workspace_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_workspace_drive_connections" ADD CONSTRAINT "grant_workspace_drive_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "grant_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_drive_syncs" ADD CONSTRAINT "grant_drive_syncs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "grant_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_drive_syncs" ADD CONSTRAINT "grant_drive_syncs_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "grant_application_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

