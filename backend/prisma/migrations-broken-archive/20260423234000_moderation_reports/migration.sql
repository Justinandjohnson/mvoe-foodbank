CREATE TABLE IF NOT EXISTS "moderation_reports" (
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

CREATE INDEX IF NOT EXISTS "moderation_reports_entity_type_entity_id_idx" ON "moderation_reports"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "moderation_reports_status_severity_created_at_idx" ON "moderation_reports"("status", "severity", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "moderation_reports_reporter_user_id_idx" ON "moderation_reports"("reporter_user_id");
CREATE INDEX IF NOT EXISTS "moderation_reports_reporter_session_id_idx" ON "moderation_reports"("reporter_session_id");

DO $$ BEGIN
    ALTER TABLE "moderation_reports"
    ADD CONSTRAINT "moderation_reports_reporter_user_id_fkey"
    FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
