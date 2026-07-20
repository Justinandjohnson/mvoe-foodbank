-- AlterTable
ALTER TABLE "food_beacons" ADD COLUMN "photo_url" TEXT;

-- CreateTable
CREATE TABLE "stored_images" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("id")
);
