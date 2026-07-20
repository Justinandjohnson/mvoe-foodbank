-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "hours" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

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
    "foodAvailable" TEXT DEFAULT 'unknown',
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
CREATE INDEX "organizations_latitude_longitude_idx" ON "organizations"("latitude", "longitude");

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
