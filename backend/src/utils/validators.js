// Validation Schemas - Zod schemas for request validation
import { z } from 'zod';

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  userType: z.enum(['donor', 'volunteer']).default('donor'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const createModerationReportSchema = z.object({
  entityType: z.enum(['food_beacon', 'community_event', 'food_bank', 'volunteer', 'grant_workspace']),
  entityId: z.string().min(1).max(128),
  reason: z.enum(['unsafe_food', 'wrong_location', 'spam', 'harassment', 'fraud', 'expired', 'other']),
  details: z.string().max(1200).optional(),
  severity: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const updateModerationReportSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
  severity: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  notes: z.string().max(1200).optional(),
});

// ============================================================================
// DONATION SCHEMAS
// ============================================================================

export const createDonationSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  amountCents: z.number().int().min(100, 'Minimum donation is $1.00').max(1000000, 'Maximum donation is $10,000'),
  isAnonymous: z.boolean().default(false),
  isRecurring: z.boolean().default(false),
  recurringInterval: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  paymentMethodId: z.string().min(1, 'Payment method required'),
});

export const donationQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// ORGANIZATION SCHEMAS
// ============================================================================

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  type: z.enum(['food_bank', 'church', 'company']),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2, 'State must be 2 characters').optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code').optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  isActive: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  hours: z.string().optional(),
  stripeAccountId: z.string().min(1).nullable().optional(),
});

// ============================================================================
// LEDGER SCHEMAS
// ============================================================================

export const createLedgerEntrySchema = z.object({
  donationId: z.string().uuid().optional(),
  organizationId: z.string().uuid('Invalid organization ID'),
  entryType: z.enum(['FUNDS_CAPTURED', 'FUNDS_SPENT', 'REFUND', 'ADJUSTMENT']),
  amountCents: z.number().int(),
  description: z.string().optional(),
  category: z.enum(['food', 'delivery', 'overhead', 'equipment']).optional(),
  vendor: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

export const ledgerQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  entryType: z.enum(['FUNDS_CAPTURED', 'FUNDS_SPENT', 'REFUND', 'ADJUSTMENT']).optional(),
  category: z.enum(['food', 'delivery', 'overhead', 'equipment']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  visibilityPreference: z.enum(['full_name', 'first_name', 'anonymous']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// ============================================================================
// PAGINATION SCHEMA
// ============================================================================

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================================
// UUID PARAM SCHEMA
// ============================================================================

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ============================================================================
// PHASE 3B: COMMUNITY EVENTS SCHEMAS
// ============================================================================

const eventBodySchema = z.object({
  eventName: z.string().min(3, 'Event name must be at least 3 characters').max(100),
  eventType: z.enum(['community_meal', 'potluck', 'barbecue', 'distribution', 'other']).default('community_meal'),
  description: z.string().max(500).optional(),
  eventDate: z.string().datetime('Invalid event date'),
  startTime: z.string().datetime('Invalid start time'),
  endTime: z.string().datetime('Invalid end time'),
  location: z.string().min(5, 'Location must be at least 5 characters').optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  targetServings: z.number().int().min(1, 'Target servings must be at least 1').max(10000),
  budgetCents: z.number().int().min(0).max(100000000).optional(),
  isPublic: z.boolean().default(true),
  maxVolunteers: z.number().int().min(1).max(500).optional(),
});

export const createEventSchema = eventBodySchema.refine((data) => {
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  return endTime > startTime;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export const updateEventSchema = eventBodySchema.partial().extend({
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
}).refine((data) => {
  if (!data.startTime || !data.endTime) return true;
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  return endTime > startTime;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export const volunteerSignupSchema = z.object({
  volunteerType: z.enum(['cooking', 'setup', 'serving', 'cleanup', 'hosting']),
  capacityOffered: z.number().int().min(1).max(1000).optional(),
  availableFrom: z.string().datetime().optional(),
  availableTo: z.string().datetime().optional(),
  specialSkills: z.string().max(200).optional(),
  notes: z.string().max(300).optional(),
});

export const resourceOfferSchema = z.object({
  resourceType: z.enum(['venue', 'equipment', 'supplies', 'transportation']),
  resourceName: z.string().min(2, 'Resource name must be at least 2 characters').max(100),
  quantity: z.string().max(50).optional(),
  capacity: z.number().int().min(0).max(10000).optional(),
  notes: z.string().max(300).optional(),
});

const boundedTextArray = z.array(z.string().trim().min(1).max(80)).max(25);

export const mealPlanSchema = z.object({
  menuItems: z.array(z.object({
    name: z.string().min(1).max(100),
    ingredients: boundedTextArray,
    servings: z.number().int().min(1).max(10000),
    prepTime: z.number().int().min(0).max(1440).optional(),
    cookTime: z.number().int().min(0).max(1440).optional(),
  })).max(50),
  shoppingList: z.array(z.object({
    item: z.string().min(1).max(100),
    quantity: z.string().min(1).max(80),
    estimatedCost: z.number().min(0).max(1000000).optional(),
  })).max(200),
  nutritionAnalysis: z.object({
    caloriesPerServing: z.number().min(0).max(10000).optional(),
    proteinGrams: z.number().min(0).max(1000).optional(),
    carbsGrams: z.number().min(0).max(1000).optional(),
    fatGrams: z.number().min(0).max(1000).optional(),
  }).optional(),
  allergenInfo: z.object({
    contains: boundedTextArray,
    warnings: z.array(z.string().trim().min(1).max(200)).max(25),
  }).optional(),
  cookingTimeline: z.array(z.object({
    time: z.string().min(1).max(40),
    task: z.string().min(1).max(200),
    duration: z.number().int().min(0).max(1440),
  })).max(100).optional(),
  totalCostCents: z.number().int().min(0).max(100000000).optional(),
});

export const dietaryProfileSchema = z.object({
  allergies: boundedTextArray.default([]),
  dietaryRestrictions: z.array(z.enum(['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free', 'halal', 'kosher'])).max(10).default([]),
  preferences: boundedTextArray.default([]),
  notes: z.string().max(300).optional(),
});

export const upsertFoodBeaconSchema = z.object({
  title: z.string().min(2).max(80).default('Food available'),
  description: z.string().max(300).optional(),
  locationLabel: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  quantityLevel: z.enum(['few', 'some', 'many']).default('some'),
  foodTypes: z.string().max(160).optional(),
  photoUrl: z.string().max(300).optional().nullable(),
  availableUntil: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
});

export const toggleFoodBeaconSchema = z.object({
  isActive: z.boolean(),
});

export const createFoodBankIndexRegionSchema = z.object({
  city: z.string().min(2, 'City is required').max(120),
  state: z.string().min(2, 'State is required').max(32),
  country: z.string().min(2).max(3).optional().default('US'),
  searchQueries: z.array(z.string().min(3)).max(10).optional(),
  isActive: z.boolean().optional().default(true),
});

export const startFoodBankIndexRunSchema = z.object({
  regionId: z.string().uuid('Valid region ID required'),
});

export const reviewFoodBankDirectoryChangeSchema = z.object({
  notes: z.string().max(300).optional(),
});
