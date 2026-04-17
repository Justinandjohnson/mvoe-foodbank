# 🚀 Get Your API Keys - Quick Start

## ⚡ 5-Minute Setup to Test AI Agents

Your AI agents are built and ready to test! You just need 2 API keys to get started.

---

## **Step 1: Get OpenAI Key** (3 minutes) ⭐ **REQUIRED**

### Quick Link: https://platform.openai.com/api-keys

1. **Click the link above**
2. **Sign up** (or log in if you have an account)
3. **Click** "Create new secret key"
4. **Name it** "Mvoe Development"
5. **Copy** the key (starts with `sk-...`)

💡 **New users get $5 free credit!**

---

## **Step 2: Get USDA Key** (2 minutes) ✅ **FREE**

### Quick Link: https://fdc.nal.usda.gov/api-key-signup.html

1. **Click the link above**
2. **Fill out the form:**
   - Name: Your name
   - Email: Your email
   - Organization: "Personal Project" or your org name
3. **Submit**
4. **Check your email** for the API key
5. **Copy** the key

💡 **Completely free, no credit card needed!**

---

## **Step 3: Add Keys to Your Project**

### **Option A: Use the Interactive Script** (Easiest)

```bash
cd /Users/jjohnson/Downloads/Mvoe
./setup-api-keys.sh
```

The script will prompt you for each key and add them automatically!

---

### **Option B: Manual Setup**

Open `/Users/jjohnson/Downloads/Mvoe/backend/.env` and add:

```bash
# Add these lines
OPENAI_API_KEY="sk-your-actual-openai-key-here"
USDA_API_KEY="your-usda-key-here"
```

Save the file.

---

## **Step 4: Test Your Agents** 🧪

```bash
cd /Users/jjohnson/Downloads/Mvoe/backend
node src/tests/agent-integration-tests.js
```

You should see:
```
✅ Meal Planner - Basic execution
✅ Meal Planner - Menu generation
✅ Meal Planner - Nutrition analysis (USDA MCP)
✅ Content Creation - Social Media (Zen MCP)
✅ Content Creation - Blog Post (Zen MCP)
```

---

## **🎉 That's It!**

With just these 2 keys, you'll have:
- ✅ Meal Planner Agent (full functionality)
- ✅ Content Creation Agent (social media, blogs, newsletters)
- ✅ Receipt Processing Agent (OCR and categorization)
- ⚠️ Price Research Agent (partial - needs Chrome DevTools)

---

## **💰 What Will This Cost?**

### OpenAI:
- **Free tier:** $5 credit (usually included)
- **After free tier:** ~$0.02 per request
- **For testing:** $5 should last weeks

### USDA:
- **FREE** forever ✅
- No credit card needed

**Total to start: $0-5** (depending on if you get free OpenAI credit)

---

## **🔐 Keep Your Keys Safe!**

- ✅ Never commit `.env` to git (already in `.gitignore`)
- ✅ Don't share your keys publicly
- ✅ Use test keys for development
- ✅ Rotate keys periodically

---

## **❓ Troubleshooting**

### "Missing credentials" error after adding keys:
```bash
# Restart your backend server
cd /Users/jjohnson/Downloads/Mvoe/backend
# Press Ctrl+C to stop the server
npm run dev
```

### "Invalid API key" error:
- Double-check you copied the FULL key
- Make sure no extra spaces
- Verify key is active in the dashboard

### Need help?
Check the full guide: `/Users/jjohnson/Downloads/Mvoe/tasks/API-KEYS-SETUP-GUIDE.md`

---

## **🚀 Ready to Go!**

1. Get OpenAI key: https://platform.openai.com/api-keys
2. Get USDA key: https://fdc.nal.usda.gov/api-key-signup.html
3. Run setup: `./setup-api-keys.sh`
4. Test agents: `node src/tests/agent-integration-tests.js`

**Let's test those AI agents!** 🤖
