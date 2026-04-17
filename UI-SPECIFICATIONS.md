# Food Bank Platform - Complete UI Specifications

## Table of Contents
1. [App Navigation Structure](#app-navigation-structure)
2. [Page-by-Page Breakdown](#page-by-page-breakdown)
3. [AI Agent Interaction Flows](#ai-agent-interaction-flows)
4. [Button Functions & API Connections](#button-functions--api-connections)
5. [Component Library](#component-library)
6. [Data Flow Architecture](#data-flow-architecture)

---

## App Navigation Structure

### Tab Navigation (Bottom)
```
┌─────────────────────────────────────────────────────────┐
│  🏠 Home    💰 Donate    🤖 Agents    📊 Impact    👤 Me  │
└─────────────────────────────────────────────────────────┘
```

### Navigation Hierarchy
```
Home Tab
├── Home Feed
├── Organization Details (tap org card)
├── Donation History (tap "View All")
└── Transaction Details (tap transaction)

Donate Tab
├── Quick Donate
├── Organization Selection
├── Payment Method
├── Confirmation
└── Receipt

Agents Tab
├── Agent Dashboard
├── Agent Detail (tap agent card)
├── Agent Working (active job)
├── Job History
└── Agent Results

Impact Tab
├── Transparency Dashboard
├── Receipt Gallery (tap receipt)
├── Expense Details
└── Download Reports

Profile Tab
├── Profile Settings
├── Notification Settings
├── Payment Methods
├── Privacy Settings
└── Help & Support
```

---

## Page-by-Page Breakdown

### 1. HOME FEED PAGE

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  📊 Live Impact Metrics                 │
│  $12,847 raised  •  2,156 meals         │
│                                         │
│  🔥 Recent Activity                     │
│  ┌─────────────────────────────────┐   │
│  │ Sarah M. donated $50            │   │
│  │ 2 minutes ago                   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🏛️ Local Organizations                │
│  ┌─────────────────────────────────┐   │
│  │ Downtown Food Bank              │   │
│  │ 🟢 Active • Needs: Rice, Beans │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🤖 AI Assistant Suggestions           │
│  ┌─────────────────────────────────┐   │
│  │ 💡 Best pasta deals found!     │   │
│  │ Price Agent • 5 min ago        │   │
│  └─────────────────────────────────┘   │
│                                         │
│               [+ DONATE]                │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **Pull to Refresh** | Reload feed data | `GET /api/feed` | Loading spinner |
| **Impact Metrics** (tap) | Navigate to Impact tab | N/A | Highlight + navigate |
| **Activity Item** (tap) | Show transaction details | `GET /api/transactions/:id` | Slide up modal |
| **Organization Card** (tap) | Show org details | `GET /api/organizations/:id` | Navigate to detail page |
| **AI Suggestion Card** (tap) | Show agent result | `GET /api/agent-jobs/:id` | Navigate to agent result |
| **"View All" Activity** | Show full activity feed | `GET /api/transactions?limit=50` | Navigate to activity page |
| **"+ DONATE" FAB** | Open donation flow | N/A | Scale animation + bottom sheet |

#### State Management
```javascript
// Home feed state
const [feedData, setFeedData] = useState({
  metrics: { totalRaised: 0, mealsProvided: 0 },
  recentActivity: [],
  organizations: [],
  agentSuggestions: []
});

// Real-time updates via WebSocket
useEffect(() => {
  socket.on('feed_updated', (data) => {
    setFeedData(prev => ({...prev, ...data}));
  });
}, []);
```

---

### 2. DONATE PAGE

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  💰 Make a Donation                     │
│                                         │
│  Choose Amount                          │
│  ┌───┐ ┌───┐ ┌───┐ ┌────┐             │
│  │$10│ │$25│ │$50│ │$100│             │
│  └───┘ └───┘ └───┘ └────┘             │
│  ┌─────────────────────────────────┐   │
│  │ Custom: $___                    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Impact Preview                         │
│  💚 $25 = 50 meals for 12 families     │
│                                         │
│  Choose Organization                    │
│  ┌─────────────────────────────────┐   │
│  │ ✓ Downtown Food Bank            │   │
│  │   Most Urgent Need              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Payment Method                         │
│  ┌─────────────────────────────────┐   │
│  │ 💳 •••• 4242  [CHANGE]         │   │
│  └─────────────────────────────────┘   │
│                                         │
│           [DONATE $25 NOW]              │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **Amount Chips** ($10, $25, $50, $100) | Set donation amount | N/A | Selected state + ripple |
| **Custom Amount Input** | Enter custom amount | N/A | Focus + validation |
| **Organization Selector** | Pick recipient org | `GET /api/organizations` | Dropdown modal |
| **Change Payment** | Update payment method | `GET /api/payment-methods` | Navigate to payment page |
| **DONATE Button** | Process payment | `POST /api/donations` | Loading + success animation |
| **Recurring Toggle** | Set up monthly donation | N/A | Switch animation |

#### Payment Flow States
```javascript
const [donationState, setDonationState] = useState({
  amount: 25,
  organization: null,
  paymentMethod: null,
  isRecurring: false,
  processing: false
});

// Stripe payment processing
const handleDonate = async () => {
  setDonationState(prev => ({...prev, processing: true}));

  try {
    const { paymentIntent } = await stripe.confirmPayment({
      payment_method: donationState.paymentMethod,
      amount: donationState.amount * 100,
      metadata: {
        organizationId: donationState.organization.id
      }
    });

    // Show success animation
    showSuccessConfetti();

    // Navigate to receipt
    navigation.navigate('Receipt', { paymentIntentId: paymentIntent.id });
  } catch (error) {
    showErrorToast(error.message);
  } finally {
    setDonationState(prev => ({...prev, processing: false}));
  }
};
```

---

### 3. AI AGENTS DASHBOARD

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  🤖 AI Assistants                       │
│  ┌─────────────────────────────────┐   │
│  │ 🔍 Search agents...             │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Active Jobs (2)                       │
│  ┌─────────────────────────────────┐   │
│  │ 🛒 Price Research Agent         │   │
│  │ ████████░░ 80% • 2 min left    │   │
│  │ Finding best pasta deals...     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Available Agents                       │
│  ┌──────────────┐ ┌──────────────┐   │
│  │ 🤝 Partner   │ │ ✍️ Content   │   │
│  │ Outreach     │ │ Creation     │   │
│  │ [START]      │ │ [START]      │   │
│  └──────────────┘ └──────────────┘   │
│  ┌──────────────┐ ┌──────────────┐   │
│  │ 💰 Grant     │ │ 📊 Data      │   │
│  │ Research     │ │ Analysis     │   │
│  │ [START]      │ │ [START]      │   │
│  └──────────────┘ └──────────────┘   │
│                                         │
│  Recent Results                         │
│  ┌─────────────────────────────────┐   │
│  │ ✅ Best Rice Deals Found        │   │
│  │ 5 min ago • View Results        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **Search Input** | Filter agents by keyword | N/A | Instant filter |
| **Active Job Card** (tap) | View job progress | `GET /api/agent-jobs/:id` | Navigate to job detail |
| **Agent Card [START]** | Start new agent job | `POST /api/agents/:type` | Loading + navigate to config |
| **Recent Result** (tap) | View completed result | `GET /api/agent-jobs/:id/result` | Navigate to result view |
| **Filter Chips** | Filter by agent category | N/A | Visual filter state |
| **Job History** | View all past jobs | `GET /api/agent-jobs?user=:id` | Navigate to history |

#### Agent State Management
```javascript
const [agentState, setAgentState] = useState({
  activeJobs: [],
  availableAgents: [],
  recentResults: [],
  searchQuery: ''
});

// Real-time job updates
useEffect(() => {
  socket.on('job_updated', (jobData) => {
    setAgentState(prev => ({
      ...prev,
      activeJobs: prev.activeJobs.map(job =>
        job.id === jobData.id ? {...job, ...jobData} : job
      )
    }));
  });
}, []);
```

---

### 4. AI AGENT DETAIL PAGE (Active Job)

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  [←] 🛒 Price Research Agent            │
│                                         │
│  Status: Working • Started 8 min ago    │
│  ████████████████░░░░ 80%              │
│  Estimated: 2 minutes remaining         │
│                                         │
│  Current Task                           │
│  ┌─────────────────────────────────┐   │
│  │ 🌐 Browsing Walmart.com         │   │
│  │ Extracting pasta prices...      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Progress Log                           │
│  ✅ Connected to Costco                │
│  ✅ Found 12 pasta products            │
│  ✅ Extracted prices and sizes         │
│  🔄 Browsing Walmart (current)         │
│  ⏳ Analyzing best deals               │
│  ⏳ Generating report                  │
│                                         │
│  Live Agent Thoughts 💭                │
│  ┌─────────────────────────────────┐   │
│  │ "Found great deal on Barilla    │   │
│  │ 16oz boxes at $1.49 each..."    │   │
│  └─────────────────────────────────┘   │
│                                         │
│            [CANCEL JOB]                 │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **← Back Button** | Return to agents dashboard | N/A | Navigate back |
| **Cancel Job** | Stop running agent | `DELETE /api/agent-jobs/:id` | Confirmation dialog |
| **Progress Steps** (tap) | Show step details | N/A | Expand with details |
| **Refresh** | Get latest status | `GET /api/agent-jobs/:id` | Pull-to-refresh |
| **Share Progress** | Share agent status | N/A | Share sheet |

#### Real-Time Updates
```javascript
const [jobDetail, setJobDetail] = useState({
  id: null,
  status: 'RUNNING',
  progress: 0,
  currentTask: '',
  progressLog: [],
  agentThoughts: [],
  estimatedTimeRemaining: 0
});

// WebSocket connection for live updates
useEffect(() => {
  const jobId = route.params.jobId;

  socket.on(`job_${jobId}_updated`, (data) => {
    setJobDetail(prev => ({...prev, ...data}));
  });

  socket.on(`job_${jobId}_thoughts`, (thought) => {
    setJobDetail(prev => ({
      ...prev,
      agentThoughts: [...prev.agentThoughts, thought]
    }));
  });

  return () => {
    socket.off(`job_${jobId}_updated`);
    socket.off(`job_${jobId}_thoughts`);
  };
}, [route.params.jobId]);
```

---

### 5. AI AGENT RESULTS PAGE

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  [←] ✅ Price Research Complete         │
│                                         │
│  🎉 Best Pasta Deals Found!             │
│  Completed 3 minutes ago                │
│                                         │
│  💰 BEST OVERALL DEAL                   │
│  ┌─────────────────────────────────┐   │
│  │ Restaurant Depot                │   │
│  │ 20lb Barilla Penne Case         │   │
│  │ $24.99 ($1.25/lb)              │   │
│  │ 💾 Save 47% vs retail          │   │
│  │ 📍 Requires membership ($60/yr) │   │
│  │         [GET DIRECTIONS]        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🥈 RUNNER UP                          │
│  ┌─────────────────────────────────┐   │
│  │ Costco Business Center          │   │
│  │ 12lb Kirkland Penne             │   │
│  │ $15.99 ($1.33/lb)              │   │
│  │ 💾 Save 44% vs retail          │   │
│  │ 📍 No membership needed         │   │
│  │         [GET DIRECTIONS]        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  📊 Full Report (8 stores compared)    │
│                                         │
│  [💾 SAVE RESULTS] [📤 SHARE] [🔄 RETRY] │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **← Back Button** | Return to agents dashboard | N/A | Navigate back |
| **Get Directions** | Open maps to store | N/A | Open external maps app |
| **Full Report** | View detailed comparison | `GET /api/agent-jobs/:id/full-report` | Navigate to detailed view |
| **Save Results** | Bookmark this result | `POST /api/saved-results` | Success toast |
| **Share** | Share deals with others | N/A | Native share sheet |
| **Retry** | Run agent again | `POST /api/agents/price-research` | Navigate to new job |
| **Deal Card** (tap) | Show store details | N/A | Expand with more info |

#### Results Data Structure
```javascript
const [agentResult, setAgentResult] = useState({
  jobId: '',
  agentType: 'PRICE_RESEARCH',
  status: 'COMPLETED',
  completedAt: '',
  results: {
    bestDeal: {
      store: 'Restaurant Depot',
      product: '20lb Barilla Penne Case',
      price: 24.99,
      pricePerLb: 1.25,
      savings: 47,
      requirements: 'Requires membership ($60/yr)',
      address: '123 Warehouse St',
      directions: 'maps://...'
    },
    alternatives: [...],
    totalStoresChecked: 8,
    fullReport: {...}
  }
});
```

---

### 6. COMMUNITY MEAL PLANNER PAGE

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  🍽️ Plan Community Cookout              │
│                                         │
│  💬 Chat with AI to Plan Event         │
│  ┌─────────────────────────────────┐   │
│  │ "Plan a cookout for 50 people,   │   │
│  │ $300 budget, some vegetarians   │   │
│  │ and one nut allergy"            │   │
│  │                                 │   │
│  │ 🤖 AI: "I'll help organize      │   │
│  │ everything with nutrition data   │   │
│  │ and allergen verification..."   │   │
│  │                           [SEND]│   │
│  └─────────────────────────────────┘   │
│                                         │
│  📋 Generated Plan Preview              │
│  ┌─────────────────────────────────┐   │
│  │ ✅ Menu: BBQ + veggie options    │   │
│  │ 💰 Cost: $287 (under budget!)   │   │
│  │ 📊 Nutrition: 650 cal/person    │   │
│  │ 🥜 NUT-FREE VERIFIED            │   │
│  │ 🌱 Vegetarian options included  │   │
│  │ 👥 Volunteers: 8 signed up      │   │
│  │ 🏠 Venue: Sarah's backyard      │   │
│  │ 🔥 Equipment: 3 grills ready    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  📊 Nutrition & Safety Dashboard        │
│  ┌─────────────────────────────────┐   │
│  │ Calories: 650 per person       │   │
│  │ Protein: 28g | Carbs: 45g      │   │
│  │ 🚨 Allergen Alerts: None       │   │
│  │ ✅ USDA Food Safety Compliant  │   │
│  │       [VIEW FULL ANALYSIS]      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🙋‍♂️ Volunteer Signup                   │
│  ┌─────────────────────────────────┐   │
│  │ I can cook for: [20] people     │   │
│  │ Skills: [Grilling, BBQ sauce]   │   │
│  │ Equipment: [Grill, Tables]      │   │
│  │ Time: [2pm-8pm]                 │   │
│  │ Dietary restrictions: [None]    │   │
│  │         [SIGN UP TO HELP]       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  📍 Venue & Equipment Sharing           │
│  ┌─────────────────────────────────┐   │
│  │ 🏠 My backyard (capacity: 75)   │   │
│  │ 🔥 Commercial grill available   │   │
│  │ 🪑 Tables & chairs (8 sets)     │   │
│  │         [SHARE MY SPACE]        │   │
│  └─────────────────────────────────┘   │
│                                         │
│       [📤 SEND INVITATIONS]             │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **Chat Input** | Send message to AI planner | `POST /api/agents/COMMUNITY_MEAL_PLANNER` | Show typing indicator |
| **Send Button** | Submit chat message | Same as above | Loading animation |
| **Plan Preview** (tap) | View full meal plan details | `GET /api/community-events/:id/meal-plan` | Navigate to detail view |
| **Nutrition Dashboard** (tap) | View detailed nutrition analysis | `GET /api/nutrition/analyze-meal` | Navigate to nutrition view |
| **View Full Analysis** | Show complete USDA nutrition data | `GET /api/community-events/:id/nutrition` | Open nutrition modal |
| **Sign Up to Help** | Register as volunteer | `POST /api/community-events/:id/volunteers` | Success confirmation |
| **Share My Space** | Offer venue/equipment | `POST /api/community-events/:id/resources` | Thank you message |
| **Send Invitations** | Distribute event invites | `POST /api/community-events/:id/invite` | Share sheet with contacts |
| **Volunteer Capacity Input** | Set cooking capacity | N/A | Update plan calculations |
| **Skills Input** | Add cooking specialties | N/A | Save to volunteer profile |
| **Equipment Checkboxes** | Select available equipment | N/A | Update resource sharing |
| **Dietary Restrictions Input** | Add personal dietary needs | `POST /api/users/dietary-profile` | Save to user profile |

#### Community Meal Planner State
```javascript
const [mealPlannerState, setMealPlannerState] = useState({
  chatMessages: [],
  currentPlan: null,
  nutritionAnalysis: null,
  allergenWarnings: [],
  volunteerSignup: {
    capacity: 0,
    skills: '',
    equipment: [],
    availability: { start: '', end: '' },
    dietaryRestrictions: []
  },
  resourceSharing: {
    venueOffered: false,
    venueCapacity: 0,
    equipmentOffered: [],
    description: ''
  },
  isAIWorking: false,
  planGenerated: false,
  nutritionVerified: false
});

// Real-time AI conversation
const sendMessageToAI = async (message) => {
  setMealPlannerState(prev => ({
    ...prev,
    isAIWorking: true,
    chatMessages: [...prev.chatMessages, { type: 'user', message }]
  }));

  try {
    const response = await apiService.startAgentJob('COMMUNITY_MEAL_PLANNER', {
      eventDetails: message,
      budget: extractBudget(message),
      targetServings: extractServings(message)
    });

    // Start polling for agent progress
    pollAgentProgress(response.jobId);

  } catch (error) {
    showErrorToast('Failed to start meal planning');
    setMealPlannerState(prev => ({ ...prev, isAIWorking: false }));
  }
};

// WebSocket updates from AI agent
useEffect(() => {
  socket.on('job-progress', (data) => {
    if (data.agentType === 'COMMUNITY_MEAL_PLANNER') {
      setMealPlannerState(prev => ({
        ...prev,
        chatMessages: [...prev.chatMessages, {
          type: 'ai',
          message: data.currentTask || data.thoughts || 'Working on your plan...'
        }]
      }));
    }
  });

  socket.on('job-completed', (data) => {
    if (data.agentType === 'COMMUNITY_MEAL_PLANNER') {
      setMealPlannerState(prev => ({
        ...prev,
        isAIWorking: false,
        planGenerated: true,
        currentPlan: data.result.final_plan,
        chatMessages: [...prev.chatMessages, {
          type: 'ai',
          message: 'Your complete meal plan is ready! 🎉'
        }]
      }));
    }
  });
}, []);
```

---

### 7. IMPACT/TRANSPARENCY DASHBOARD

#### Visual Layout
```
┌─────────────────────────────────────────┐
│  📊 Community Impact                    │
│                                         │
│  💰 TOTAL RAISED                       │
│      $12,847                           │
│  🍽️ MEALS PROVIDED                     │
│      2,156                             │
│  👨‍👩‍👧‍👦 FAMILIES SERVED                    │
│      342                               │
│                                         │
│  💸 Money Flow (This Month)            │
│  ┌─────────────────────────────────┐   │
│  │ 🔵 Food: $8,200 (75%)          │   │
│  │ 🟡 Delivery: $1,100 (10%)      │   │
│  │ 🟠 Overhead: $400 (3.5%)       │   │
│  │ 🟢 Available: $1,247 (11.5%)   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🧾 Recent Expenses                    │
│  ┌─────────────────────────────────┐   │
│  │ 📸 Costco Rice Purchase         │   │
│  │ $247.89 • 2 hours ago          │   │
│  │ [VIEW RECEIPT]                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│           [📥 DOWNLOAD REPORT]          │
└─────────────────────────────────────────┘
```

#### All Buttons & Functions

| Button/Element | Function | API Endpoint | Visual Feedback |
|----------------|----------|--------------|-----------------|
| **Metric Cards** (tap) | Show detailed breakdown | `GET /api/metrics/:type` | Navigate to detail view |
| **Chart Segments** (tap) | Show category expenses | `GET /api/expenses?category=:cat` | Highlight + detail modal |
| **View Receipt** | Show receipt photo | `GET /api/receipts/:id` | Full-screen image viewer |
| **Expense Item** (tap) | Show expense details | `GET /api/expenses/:id` | Slide-up detail modal |
| **Download Report** | Generate CSV export | `GET /api/reports/csv` | Download + success toast |
| **Filter Controls** | Filter by date/category | N/A | Update chart + list |

---

## AI Agent Interaction Flows

### Flow 1: Starting a Price Research Agent

```
User Journey:
1. Tap "Agents" tab
2. Tap "Price Research" agent card
3. Configure search parameters
4. Watch real-time progress
5. View and act on results

Detailed Flow:
┌─────────────────────┐
│ Agent Dashboard     │
│ [Price Research]    │ → Tap
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Configure Agent     │
│ Food: [Pasta      ] │
│ Qty:  [100 lbs    ] │
│ Area: [10 miles   ] │
│ [START RESEARCH]    │ → Tap
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Job Queued          │
│ Position: #2        │
│ Est Start: 30 sec   │ → Auto-navigate
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Agent Working       │
│ Progress: 25%       │
│ Task: Browsing...   │ → Real-time updates
│ Thoughts: "Found..." │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Results Ready! 🎉   │
│ Best Deal Found     │
│ [VIEW RESULTS]      │ → Tap
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Detailed Results    │
│ Store comparisons   │
│ [GET DIRECTIONS]    │ → Action
│ [SAVE] [SHARE]      │
└─────────────────────┘
```

### Flow 2: Partner Outreach Agent (Human-in-the-Loop)

```
User Journey:
1. Start Partner Outreach agent
2. Agent researches local churches
3. Agent generates email drafts
4. User reviews and approves emails
5. Agent sends approved emails
6. Track response rates

Detailed Flow:
┌─────────────────────┐
│ Configure Outreach  │
│ Type: [Churches   ] │
│ Area: [5 miles    ] │
│ Tone: [Friendly   ] │
│ [START OUTREACH]    │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Researching...      │
│ Found 12 churches   │
│ Extracting contacts │ → Progress updates
│ Generating emails   │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Ready for Review    │
│ 12 emails drafted   │
│ [REVIEW EMAILS]     │ → Human approval needed
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Email Review        │
│ To: St. Mary's      │
│ Subject: "Partner   │
│ with us..."         │
│ [✓ APPROVE] [✏️ EDIT] │ → User controls
│ [❌ SKIP]            │
└─────────────────────┘
           ↓ (After approval)
┌─────────────────────┐
│ Sending Emails...   │
│ 8 approved          │
│ 4 edited            │ → Agent executes
│ 0 skipped           │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Outreach Complete   │
│ 12 emails sent      │
│ 3 responses (25%)   │ → Track results
│ [VIEW RESPONSES]    │
└─────────────────────┘
```

### Flow 3: Real-Time Agent Monitoring

```
Visual States of Agent Cards:

IDLE STATE:
┌─────────────────────┐
│ 🛒 Price Research   │
│ Find best deals     │
│ Last run: 2 days    │
│      [START]        │
└─────────────────────┘

QUEUED STATE:
┌─────────────────────┐
│ 🛒 Price Research   │
│ ⏳ Position #2      │
│ Starts in: ~30 sec  │
│     [CANCEL]        │
└─────────────────────┘

WORKING STATE (Animated):
┌─────────────────────┐
│ 🛒 Price Research   │
│ 🔄 Working... 45%   │
│ ████████░░░░░░░░░░  │
│ Est: 3 min left     │
│ Browsing Costco...  │
└─────────────────────┘

COMPLETED STATE:
┌─────────────────────┐
│ 🛒 Price Research   │
│ ✅ Complete! 🎉     │
│ Best deal: $1.25/lb │
│   [VIEW RESULTS]    │
└─────────────────────┘

ERROR STATE:
┌─────────────────────┐
│ 🛒 Price Research   │
│ ❌ Failed           │
│ Site unavailable    │
│ [RETRY] [DETAILS]   │
└─────────────────────┘
```

### Flow 4: Community Meal Planner (Conversational AI)

```
User Journey:
1. Open Community Meal Planner
2. Chat with AI to describe event
3. AI researches prices and generates plan
4. Sign up volunteers and resources
5. Send invitations to community

Detailed Flow:
┌─────────────────────┐
│ "Plan a cookout for │
│ 50 people, $300     │ → User types message
│ budget, some veget- │
│ arians, one nut     │
│ allergy, Saturday"  │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ AI: "I'll help you  │
│ plan everything!    │ → Immediate response
│ Let me research     │
│ nutrition & prices..│
└─────────────────────┘
           ↓
┌─────────────────────┐
│ 🔄 AI Working       │
│ Analyzing nutrition │ → Real-time updates
│ Verifying allergens │
│ Researching prices  │
│ Creating timeline   │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Plan Ready! 🎉      │
│ Menu: BBQ + veggie  │ → Complete plan shown
│ Cost: $287          │
│ 🥜 NUT-FREE ✅      │
│ 650 cal/person     │
│ Timeline: 12-6pm    │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Volunteer Signup    │
│ "I can cook for 20" │ → Easy signup forms
│ "I have grills"     │
│ [SIGN UP TO HELP]   │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Resource Sharing    │
│ "My backyard hosts  │ → Venue/equipment
│ 75 people"          │   sharing
│ [SHARE MY SPACE]    │
└─────────────────────┘
           ↓
┌─────────────────────┐
│ Everything Ready!   │
│ 8 volunteers signed │ → Final coordination
│ Venue confirmed     │
│ [SEND INVITATIONS]  │
└─────────────────────┘
```

---

## Button Functions & API Connections

### Complete API Mapping

| UI Action | HTTP Method | Endpoint | Request Body | Response | UI Update |
|-----------|-------------|----------|--------------|----------|-----------|
| **Load Home Feed** | GET | `/api/feed` | N/A | `{metrics, activity, orgs, suggestions}` | Update feed state |
| **Start Donation** | GET | `/api/organizations` | N/A | `{organizations: [...]}` | Populate org selector |
| **Process Payment** | POST | `/api/donations` | `{amount, orgId, paymentMethod}` | `{donationId, receipt}` | Show success + receipt |
| **Start Agent Job** | POST | `/api/agents/:type` | `{inputData}` | `{jobId, status}` | Navigate to job detail |
| **Get Job Status** | GET | `/api/agent-jobs/:id` | N/A | `{status, progress, result}` | Update progress UI |
| **Cancel Job** | DELETE | `/api/agent-jobs/:id` | N/A | `{cancelled: true}` | Return to dashboard |
| **Save Agent Result** | POST | `/api/saved-results` | `{jobId, userId}` | `{saved: true}` | Show success toast |
| **Get Impact Data** | GET | `/api/metrics` | N/A | `{raised, meals, families}` | Update dashboard |
| **Download Report** | GET | `/api/reports/csv` | `?dateRange=month` | CSV file | Trigger download |
| **Start Meal Planning** | POST | `/api/agents/COMMUNITY_MEAL_PLANNER` | `{eventDetails, budget, targetServings}` | `{jobId, status}` | Show chat interface |
| **Volunteer Signup** | POST | `/api/community-events/:id/volunteers` | `{capacity, skills, equipment, availability}` | `{volunteerId, confirmed}` | Success confirmation |
| **Share Resources** | POST | `/api/community-events/:id/resources` | `{resourceType, name, capacity, description}` | `{resourceId, confirmed}` | Thank you message |
| **Get Event Plan** | GET | `/api/community-events/:id/meal-plan` | N/A | `{menu, timeline, assignments, costs}` | Display full plan |

### WebSocket Events

| Event | Trigger | Data | UI Response |
|-------|---------|------|-------------|
| `job_started` | Agent job begins | `{jobId, userId, agentType}` | Show working state |
| `job_progress` | Agent makes progress | `{jobId, progress, currentTask}` | Update progress bar |
| `job_thoughts` | Agent reasoning | `{jobId, thought, timestamp}` | Add to thought stream |
| `job_completed` | Agent finishes | `{jobId, status, result}` | Show results notification |
| `donation_received` | New donation | `{amount, org, donor}` | Update feed + metrics |
| `expense_logged` | New expense | `{amount, category, receipt}` | Update transparency feed |

---

## Component Library

### Core Components with Props

#### 1. AgentCard Component
```javascript
const AgentCard = ({
  agent,
  onStart,
  onViewResult,
  onCancel
}) => {
  const getStatusColor = (status) => {
    switch(status) {
      case 'IDLE': return colors.neutral;
      case 'QUEUED': return colors.accent;
      case 'RUNNING': return colors.primary;
      case 'COMPLETED': return colors.secondary;
      case 'FAILED': return colors.alert;
    }
  };

  return (
    <Card style={[styles.agentCard, {borderColor: getStatusColor(agent.status)}]}>
      <Card.Content>
        <View style={styles.agentHeader}>
          <Text style={styles.agentIcon}>{agent.icon}</Text>
          <Text style={styles.agentName}>{agent.name}</Text>
          {agent.status === 'RUNNING' && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>

        {agent.status === 'RUNNING' && (
          <>
            <ProgressBar progress={agent.progress / 100} />
            <Text style={styles.progressText}>
              {agent.currentTask} • {agent.estimatedTime} left
            </Text>
          </>
        )}

        {agent.status === 'COMPLETED' && (
          <Text style={styles.resultPreview}>
            {agent.resultPreview}
          </Text>
        )}

        <View style={styles.agentActions}>
          {agent.status === 'IDLE' && (
            <Button mode="contained" onPress={() => onStart(agent.type)}>
              Start
            </Button>
          )}
          {agent.status === 'RUNNING' && (
            <Button mode="outlined" onPress={() => onCancel(agent.jobId)}>
              Cancel
            </Button>
          )}
          {agent.status === 'COMPLETED' && (
            <Button mode="contained" onPress={() => onViewResult(agent.jobId)}>
              View Results
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  );
};
```

#### 2. DonationAmountSelector Component
```javascript
const DonationAmountSelector = ({
  selectedAmount,
  onAmountChange,
  customAmount,
  onCustomAmountChange
}) => {
  const presetAmounts = [10, 25, 50, 100];

  return (
    <View style={styles.amountSelector}>
      <Text style={styles.sectionTitle}>Choose Amount</Text>

      <View style={styles.amountGrid}>
        {presetAmounts.map(amount => (
          <Chip
            key={amount}
            selected={selectedAmount === amount}
            onPress={() => onAmountChange(amount)}
            style={styles.amountChip}
          >
            ${amount}
          </Chip>
        ))}
      </View>

      <TextInput
        label="Custom Amount"
        value={customAmount}
        onChangeText={onCustomAmountChange}
        keyboardType="numeric"
        left={<TextInput.Icon icon="currency-usd" />}
        style={styles.customAmountInput}
      />

      <Text style={styles.impactText}>
        ${selectedAmount || customAmount} provides {(selectedAmount || customAmount) * 2} meals
        for {Math.floor((selectedAmount || customAmount) / 5)} families
      </Text>
    </View>
  );
};
```

#### 3. TransparencyMetrics Component
```javascript
const TransparencyMetrics = ({ metrics, onMetricPress }) => {
  const animatedValues = {
    totalRaised: useRef(new Animated.Value(0)).current,
    mealsProvided: useRef(new Animated.Value(0)).current,
    familiesServed: useRef(new Animated.Value(0)).current
  };

  useEffect(() => {
    // Animate numbers counting up
    Object.keys(animatedValues).forEach(key => {
      Animated.timing(animatedValues[key], {
        toValue: metrics[key] || 0,
        duration: 2000,
        useNativeDriver: false
      }).start();
    });
  }, [metrics]);

  return (
    <View style={styles.metricsContainer}>
      <TouchableOpacity
        style={styles.metricCard}
        onPress={() => onMetricPress('totalRaised')}
      >
        <Text style={styles.metricIcon}>💰</Text>
        <Text style={styles.metricLabel}>TOTAL RAISED</Text>
        <Animated.Text style={styles.metricValue}>
          ${animatedValues.totalRaised._value.toLocaleString()}
        </Animated.Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.metricCard}
        onPress={() => onMetricPress('mealsProvided')}
      >
        <Text style={styles.metricIcon}>🍽️</Text>
        <Text style={styles.metricLabel}>MEALS PROVIDED</Text>
        <Animated.Text style={styles.metricValue}>
          {animatedValues.mealsProvided._value.toLocaleString()}
        </Animated.Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.metricCard}
        onPress={() => onMetricPress('familiesServed')}
      >
        <Text style={styles.metricIcon}>👨‍👩‍👧‍👦</Text>
        <Text style={styles.metricLabel}>FAMILIES SERVED</Text>
        <Animated.Text style={styles.metricValue}>
          {animatedValues.familiesServed._value.toLocaleString()}
        </Animated.Text>
      </TouchableOpacity>
    </View>
  );
};
```

---

## Data Flow Architecture

### State Management with Zustand

```javascript
// Global app state
const useAppStore = create((set, get) => ({
  // User data
  user: null,
  isAuthenticated: false,

  // Feed data
  feedData: {
    metrics: { totalRaised: 0, mealsProvided: 0, familiesServed: 0 },
    recentActivity: [],
    organizations: [],
    agentSuggestions: []
  },

  // Agent data
  agentJobs: [],
  agentResults: [],

  // Actions
  setUser: (user) => set({ user, isAuthenticated: !!user }),

  updateFeedData: (data) => set(state => ({
    feedData: { ...state.feedData, ...data }
  })),

  addAgentJob: (job) => set(state => ({
    agentJobs: [...state.agentJobs, job]
  })),

  updateAgentJob: (jobId, updates) => set(state => ({
    agentJobs: state.agentJobs.map(job =>
      job.id === jobId ? { ...job, ...updates } : job
    )
  })),

  removeAgentJob: (jobId) => set(state => ({
    agentJobs: state.agentJobs.filter(job => job.id !== jobId)
  }))
}));
```

### WebSocket Integration

```javascript
// WebSocket service
class WebSocketService {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(userId) {
    this.socket = io(API_BASE_URL, {
      query: { userId },
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.handleReconnect();
    });

    // Agent job updates
    this.socket.on('job_updated', (data) => {
      useAppStore.getState().updateAgentJob(data.jobId, data);
    });

    // Feed updates
    this.socket.on('feed_updated', (data) => {
      useAppStore.getState().updateFeedData(data);
    });

    // Real-time notifications
    this.socket.on('notification', (notification) => {
      showNotification(notification);
    });
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect(useAppStore.getState().user?.id);
      }, Math.pow(2, this.reconnectAttempts) * 1000);
    }
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Global instance
export const wsService = new WebSocketService();
```

### API Service Layer

```javascript
// API service with error handling and caching
class APIService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async request(method, endpoint, data = null, options = {}) {
    const { cache = false, timeout = 10000 } = options;

    // Check cache first
    if (cache && method === 'GET') {
      const cached = this.getFromCache(endpoint);
      if (cached) return cached;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: data ? JSON.stringify(data) : null,
        timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Cache successful GET requests
      if (cache && method === 'GET') {
        this.setCache(endpoint, result);
      }

      return result;
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error);
      throw error;
    }
  }

  // Specific methods
  getFeed() {
    return this.request('GET', '/api/feed', null, { cache: true });
  }

  startAgentJob(agentType, inputData) {
    return this.request('POST', `/api/agents/${agentType}`, inputData);
  }

  getAgentJob(jobId) {
    return this.request('GET', `/api/agent-jobs/${jobId}`);
  }

  cancelAgentJob(jobId) {
    return this.request('DELETE', `/api/agent-jobs/${jobId}`);
  }

  createDonation(donationData) {
    return this.request('POST', '/api/donations', donationData);
  }

  getMetrics() {
    return this.request('GET', '/api/metrics', null, { cache: true });
  }

  // Cache management
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

export const apiService = new APIService();
```

This comprehensive UI specification provides everything needed to build the food bank platform with full AI agent integration. Every button, interaction, and data flow is mapped out with working code examples.