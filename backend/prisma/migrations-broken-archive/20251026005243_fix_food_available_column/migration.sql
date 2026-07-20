DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'food_bank_status'
      AND column_name = 'foodAvailable'
  ) THEN
    ALTER TABLE "food_bank_status" RENAME COLUMN "foodAvailable" TO "food_available";
  END IF;
END $$;
