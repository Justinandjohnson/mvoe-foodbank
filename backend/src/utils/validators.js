// Validation Schemas - Zod schemas for request validation
import { z } from 'zod';

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  userType: z.enum(['donor', 'volunteer', 'staff', 'admin']).default('donor'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
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

export const updateOrganizationSchema = createOrganizationSchema.partial();

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

export const createEventSchema = z.object({
  eventName: z.string().min(3, 'Event name must be at least 3 characters').max(100),
  description: z.string().max(500).optional(),
  eventDate: z.string().datetime('Invalid event date'),
  startTime: z.string().datetime('Invalid start time'),
  endTime: z.string().datetime('Invalid end time'),
  location: z.string().min(5, 'Location must be at least 5 characters').optional(),
  targetServings: z.number().int().min(1, 'Target servings must be at least 1').max(10000),
  budgetCents: z.number().int().min(0).optional(),
  isPublic: z.boolean().default(true),
  maxVolunteers: z.number().int().min(1).optional(),
}).refine((data) => {
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
  capacity: z.number().int().min(0).optional(),
  notes: z.string().max(300).optional(),
});

export const mealPlanSchema = z.object({
  menuItems: z.array(z.object({
    name: z.string(),
    ingredients: z.array(z.string()),
    servings: z.number().int().min(1),
    prepTime: z.number().int().optional(),
    cookTime: z.number().int().optional(),
  })),
  shoppingList: z.array(z.object({
    item: z.string(),
    quantity: z.string(),
    estimatedCost: z.number().optional(),
  })),
  nutritionAnalysis: z.object({
    caloriesPerServing: z.number().optional(),
    proteinGrams: z.number().optional(),
    carbsGrams: z.number().optional(),
    fatGrams: z.number().optional(),
  }).optional(),
  allergenInfo: z.object({
    contains: z.array(z.string()),
    warnings: z.array(z.string()),
  }).optional(),
  cookingTimeline: z.array(z.object({
    time: z.string(),
    task: z.string(),
    duration: z.number().int(),
  })).optional(),
  totalCostCents: z.number().int().min(0).optional(),
});

export const dietaryProfileSchema = z.object({
  allergies: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.enum(['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free', 'halal', 'kosher'])).default([]),
  preferences: z.array(z.string()).default([]),
  notes: z.string().max(300).optional(),
});
