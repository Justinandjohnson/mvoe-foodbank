# 🔑 API Keys Setup Guide

## Required API Keys for AI Agents

Your AI agents need these API keys to function. Here's how to get them:

---

## 1. OpenAI API Key (REQUIRED) ⭐

**Used by:** All AI agents (Meal Planner, Price Research, Receipt Processing, Content Creation)

### How to Get It:

1. **Go to:** https://platform.openai.com/signup
2. **Sign up** or log in with your account
3. **Navigate to:** https://platform.openai.com/api-keys
4. **Click:** "Create new secret key"
5. **Copy** the key (starts with `sk-...`)

### Add to .env:
```bash
OPENAI_API_KEY=sk-your-actual-key-here
```

### Pricing:
- **GPT-3.5-turbo:** $0.0005 per 1K tokens (~$0.50 per 1M tokens)
- **GPT-4:** $0.01 per 1K tokens (~$10 per 1M tokens)
- **Recommended:** Start with GPT-3.5-turbo (cheap and fast)

### Estimated Cost:
- **Meal planning:** ~$0.02 per request
- **Content creation:** ~$0.03 per request
- **Receipt processing:** ~$0.01 per receipt
- **Total for 100 requests:** ~$2-3

---

## 2. USDA FoodData Central API Key (FREE) ✅

**Used by:** Meal Planner Agent (nutrition analysis, allergen verification)

### How to Get It:

1. **Go to:** https://fdc.nal.usda.gov/api-key-signup.html
2. **Fill out the form:**
   - Name
   - Email
   - Organization (can be "Personal Project")
3. **Submit** and check your email
4. **Copy** the API key from the email

### Add to .env:
```bash
USDA_API_KEY=your-usda-key-here
```

### Pricing:
- **FREE** ✅
- Rate limit: 1,000 requests per hour
- Perfect for meal planning

---

## 3. Alternative: Google Gemini API (OPTIONAL)

**Alternative to OpenAI** - Can use Google's AI instead

### How to Get It:

1. **Go to:** https://makersuite.google.com/app/apikey
2. **Click:** "Get API Key"
3. **Create** or select a Google Cloud project
4. **Copy** the API key

### Add to .env:
```bash
GOOGLE_API_KEY=your-google-api-key
```

### Pricing:
- **Gemini 1.5 Flash:** FREE up to 1,500 requests/day
- Much cheaper than OpenAI for high volume

---

## 4. Stripe API Keys (REQUIRED for payments) 💳

**Used by:** Donation system

### How to Get It:

1. **Go to:** https://dashboard.stripe.com/register
2. **Sign up** for a Stripe account
3. **Navigate to:** https://dashboard.stripe.com/test/apikeys
4. **Copy** both keys:
   - Secret key (starts with `YOUR_STRIPE_SECRET_KEY...`)
   - Publishable key (starts with `YOUR_STRIPE_PUBLISHABLE_KEY...`)

### Add to .env:

**Backend (.env):**
```bash
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET
```

**Frontend (.env):**
```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=YOUR_STRIPE_PUBLISHABLE_KEY
```

### Pricing:
- **Test mode:** FREE (for development)
- **Production:** 2.9% + $0.30 per transaction

---

## 5. Mapbox API Key (OPTIONAL - for maps) 🗺️

**Used by:** Food bank finder with maps

### How to Get It:

1. **Go to:** https://account.mapbox.com/auth/signup/
2. **Sign up** for a free account
3. **Navigate to:** https://account.mapbox.com/access-tokens/
4. **Copy** your default public token

### Add to .env:

**Backend:**
```bash
MAPBOX_API_KEY=pk.your_mapbox_key_here
```

**Frontend:**
```bash
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_key_here
```

### Pricing:
- **Free tier:** 50,000 map loads/month
- More than enough for MVP

---

## 🚀 Quick Setup Steps

### Step 1: Get OpenAI Key (5 minutes)
This is the MOST IMPORTANT one - all AI agents need this.

1. Go to: https://platform.openai.com/api-keys
2. Create account if needed
3. Click "Create new secret key"
4. Copy the key

### Step 2: Get USDA Key (2 minutes)
Free nutrition data - highly recommended.

1. Go to: https://fdc.nal.usda.gov/api-key-signup.html
2. Fill form and submit
3. Check email for key

### Step 3: Add to .env file

Open `/backend/.env` and add:

```bash
# AI APIs
OPENAI_API_KEY=sk-your-actual-openai-key
USDA_API_KEY=your-usda-key

# Stripe (use test keys for now)
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET

# Optional but recommended
MAPBOX_API_KEY=pk.your_mapbox_key
```

### Step 4: Restart Backend

```bash
cd /Users/jjohnson/Downloads/Mvoe/backend
npm run dev
```

### Step 5: Test the Agents

```bash
cd /Users/jjohnson/Downloads/Mvoe/backend
node src/tests/agent-integration-tests.js
```

---

## 💰 Total Cost Estimate

### Minimum to Start (MVP):
- **OpenAI:** $5 credit to start (free trial usually included)
- **USDA:** FREE ✅
- **Stripe:** FREE in test mode ✅
- **Total:** ~$5

### Monthly Operating Cost (100 users):
- **OpenAI:** ~$10-20/month (depends on usage)
- **USDA:** FREE ✅
- **Stripe:** 2.9% of donations only
- **Hosting:** ~$25/month (Railway + Vercel)
- **Total:** ~$35-45/month + transaction fees

---

## 🔒 Security Best Practices

### DO:
✅ Store keys in `.env` file (already gitignored)
✅ Use test/development keys for testing
✅ Rotate keys periodically
✅ Use separate keys for production

### DON'T:
❌ Commit `.env` to git
❌ Share keys publicly
❌ Use production keys in development
❌ Hardcode keys in source code

---

## 🧪 Testing Without All Keys

You can test with just OpenAI key:
- ✅ Meal Planner (needs OpenAI + USDA)
- ✅ Content Creation (needs OpenAI only)
- ✅ Receipt Processing (needs OpenAI only)
- ⚠️ Price Research (needs OpenAI + Chrome DevTools)

**Start with OpenAI + USDA keys and you'll have 80% functionality!**

---

## ❓ Troubleshooting

### "Missing credentials" error:
- Check `.env` file exists in `/backend`
- Verify key format (OpenAI starts with `sk-`)
- Restart backend after adding keys

### "Invalid API key" error:
- Double-check you copied the full key
- Verify key is active (check dashboard)
- Make sure no extra spaces in `.env`

### "Rate limit exceeded":
- OpenAI free tier: 3 requests/min
- USDA: 1,000 requests/hour
- Wait a minute and try again

---

## 📞 Need Help?

1. **OpenAI Issues:** https://help.openai.com/
2. **USDA Issues:** https://fdc.nal.usda.gov/help.html
3. **Stripe Issues:** https://support.stripe.com/

---

## ✅ Next Steps After Setup

Once you have your API keys configured:

1. ✅ Run the test suite: `node src/tests/agent-integration-tests.js`
2. ✅ Verify all agents pass
3. ✅ Test in the frontend UI
4. ✅ Ready to deploy!

**Let's get those keys! Start with OpenAI - it's the most critical one.** 🚀
