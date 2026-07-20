-- AlterTable
ALTER TABLE "community_events"
ADD COLUMN     "event_type" TEXT NOT NULL DEFAULT 'community_meal',
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "food_beacons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Food available',
    "description" TEXT,
    "location_label" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "quantity_level" TEXT NOT NULL DEFAULT 'some',
    "food_types" TEXT,
    "available_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_beacons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_events_latitude_longitude_idx" ON "community_events"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "food_beacons_user_id_key" ON "food_beacons"("user_id");

-- CreateIndex
CREATE INDEX "food_beacons_is_active_is_public_idx" ON "food_beacons"("is_active", "is_public");

-- CreateIndex
CREATE INDEX "food_beacons_latitude_longitude_idx" ON "food_beacons"("latitude", "longitude");

-- AddForeignKey
ALTER TABLE "food_beacons" ADD CONSTRAINT "food_beacons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
