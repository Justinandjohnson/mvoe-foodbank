# Phase 2: Food Bank Integration - Implementation Plan

## Overview
**Goal**: Enable food banks to manage donations through manual portal + add food bank finder with live status

**Estimated Time**: 2-3 weeks

---

## Step 1: Database Schema Updates

### New Tables to Create:
1. **food_bank_staff** - Staff authentication and roles
2. **organization_members** - Link users to organizations
3. **food_bank_status** - Live status updates (wait time, food availability)
4. **food_needs** - Current needs list
5. **meals** - Meal preparation tracking
6. **volunteer_shifts** - Volunteer scheduling
7. **deliveries** - Meal delivery tracking

### Schema Changes:
- Add `latitude`, `longitude`, `hours` to organizations table
- Add `last_status_update` timestamp
- Create indexes for geospatial queries

---

## Step 2: Food Bank Finder & Map System

### Backend Tasks:
- [ ] Create `/api/food-banks/nearby` endpoint (geospatial query)
- [ ] Create `/api/food-banks/:id/status` endpoint
- [ ] Create `/api/food-banks/:id/update-status` endpoint (staff only)
- [ ] Implement status expiry (mark data stale after 2 hours)

### Frontend Tasks:
- [ ] Install Mapbox GL JS package
- [ ] Create MapView component
- [ ] Build food bank marker components
- [ ] Implement geolocation "Find Nearest"
- [ ] Create food bank detail card UI
- [ ] Add search/filter functionality
- [ ] Build list view alternative

### Mapbox Integration:
- Get Mapbox API key
- Configure Mapbox in React Native Web
- Style custom markers
- Add Directions API for routing

---

## Step 3: Food Bank Portal (Staff Dashboard)

### Backend:
- [ ] Create staff authentication system
- [ ] Build `/portal/dashboard` endpoint
- [ ] Create `/portal/donations` endpoint (food bank specific)
- [ ] Build `/portal/status/update` endpoint
- [ ] Implement role-based access control (admin, staff, viewer)

### Frontend:
- [ ] Build staff login page
- [ ] Create dashboard layout
- [ ] Build donations list (pending, accepted, declined)
- [ ] Create status update form (mobile-friendly)
- [ ] Add needs list management UI
- [ ] Build notification system

---

## Step 4: Enhanced Features

### Organization Registration:
- [ ] Create organization signup flow
- [ ] Add verification workflow
- [ ] Build admin approval interface

### Volunteer System:
- [ ] Create volunteer registration
- [ ] Build volunteer profiles
- [ ] Add shift scheduling interface

### Meal Coordination:
- [ ] Create meal planning interface
- [ ] Build delivery assignment system
- [ ] Add meal status tracking

---

## Step 5: Testing & Validation

### Test Cases:
- [ ] Test geolocation accuracy
- [ ] Test map performance with 100+ markers
- [ ] Test status updates in real-time
- [ ] Test staff authentication and permissions
- [ ] Test on mobile browsers (map touch interactions)
- [ ] Test offline behavior

---

## Phase 2 Success Criteria:
- ✅ Interactive map showing all food banks
- ✅ Live status updates (wait time, food availability)
- ✅ Staff can log in and manage donations
- ✅ Users can find nearest food bank
- ✅ Status data expires appropriately
- ✅ Mobile-friendly map interface

---

## Technical Notes:

### Mapbox Setup:
```bash
npm install mapbox-gl @rnmapbox/maps
```

### Geospatial Query Example:
```sql
-- Find food banks within 10 miles
SELECT *,
  ( 3959 * acos( cos( radians(?) )
  * cos( radians( latitude ) )
  * cos( radians( longitude ) - radians(?) )
  + sin( radians(?) )
  * sin( radians( latitude ) ) ) ) AS distance
FROM organizations
WHERE type = 'food_bank'
HAVING distance < 10
ORDER BY distance;
```

### Status Update Flow:
1. Food bank staff opens status form
2. Updates wait time (0-120 minutes)
3. Updates food availability (available/low/out)
4. Updates capacity percentage (0-100%)
5. Backend timestamps update
6. Auto-expire after 2 hours
7. Display "Last updated X minutes ago"

---

## Next Steps:
1. Review this plan
2. Start with database schema updates
3. Build map system (highest user value)
4. Build staff portal
5. Add enhanced features
6. Test and deploy
