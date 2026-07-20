ALTER TABLE "community_events"
  ALTER COLUMN "organizer_id" DROP NOT NULL,
  ADD COLUMN "organizer_session_id" TEXT;

CREATE INDEX IF NOT EXISTS "community_events_organizer_session_id_idx"
  ON "community_events"("organizer_session_id");

ALTER TABLE "food_beacons"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "session_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "food_beacons_session_id_key"
  ON "food_beacons"("session_id");

ALTER TABLE "event_volunteers"
  ALTER COLUMN "volunteer_id" DROP NOT NULL,
  ADD COLUMN "volunteer_session_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "event_volunteers_event_id_volunteer_session_id_key"
  ON "event_volunteers"("event_id", "volunteer_session_id");

CREATE INDEX IF NOT EXISTS "event_volunteers_volunteer_session_id_idx"
  ON "event_volunteers"("volunteer_session_id");

ALTER TABLE "event_resources"
  ALTER COLUMN "provider_id" DROP NOT NULL,
  ADD COLUMN "provider_session_id" TEXT;

CREATE INDEX IF NOT EXISTS "event_resources_provider_session_id_idx"
  ON "event_resources"("provider_session_id");

ALTER TABLE "event_dietary_profiles"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "session_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "event_dietary_profiles_event_id_session_id_key"
  ON "event_dietary_profiles"("event_id", "session_id");

CREATE INDEX IF NOT EXISTS "event_dietary_profiles_session_id_idx"
  ON "event_dietary_profiles"("session_id");
