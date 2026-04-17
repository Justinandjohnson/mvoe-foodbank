# 🤖 Claude API Key Setup (CORRECT ONE!)

## ✅ Use Claude (Anthropic) - NOT OpenAI

**Your AI agents now use Claude API, which is:**
- ✅ Better quality responses
- ✅ More cost-effective
- ✅ Longer context windows
- ✅ More reliable for complex tasks

---

## **Step 1: Get Claude API Key** (3 minutes) ⭐

### Quick Link: https://console.anthropic.com/

1. **Go to:** https://console.anthropic.com/
2. **Sign up** or log in
3. **Navigate to:** API Keys section
4. **Click:** "Create Key"
5. **Copy** the key (starts with `sk-ant-...`)

💡 **New users get $5 free credit!**

---

## **Step 2: Add to Your Project**

Edit `/Users/jjohnson/Downloads/Mvoe/backend/.env`:

```bash
# Add this line
ANTHROPIC_API_KEY="sk-ant-your-actual-key-here"

# OR use this alternative name
CLAUDE_API_KEY="sk-ant-your-actual-key-here"
```

---

## **Step 3: Get USDA Key** (Still needed, still FREE)

**Link:** https://fdc.nal.usda.gov/api-key-signup.html

This is for nutrition data only.

```bash
USDA_API_KEY="your-usda-key-here"
```

---

## **💰 Claude Pricing (Better than OpenAI)**

### Claude 3.5 Sonnet:
- **Input:** $3 per million tokens (~$0.003 per 1K tokens)
- **Output:** $15 per million tokens (~$0.015 per 1K tokens)

### What this means:
- **Meal planning:** ~$0.01 per request (cheaper than OpenAI)
- **Content creation:** ~$0.02 per request
- **Receipt processing:** ~$0.005 per receipt
- **$5 credit = 500+ requests**

### Comparison to OpenAI:
- 🟢 Claude: Better quality, similar price
- 🟡 OpenAI GPT-3.5: Cheaper but lower quality
- 🔴 OpenAI GPT-4: More expensive, similar quality to Claude

**Claude is the best choice for your use case!**

---

## **🧪 Test Your Setup**

After adding your Claude API key:

```bash
cd /Users/jjohnson/Downloads/Mvoe/backend
node src/tests/agent-integration-tests.js
```

You should see:
```
✅ Meal Planner - Basic execution
✅ Content Creation - Social Media (Claude)
✅ Receipt Processing - OCR and categorization
```

---

## **❓ Why Claude Over OpenAI?**

1. **Better at following instructions** - More reliable for structured tasks
2. **Longer context** - Can handle bigger meal plans and receipts
3. **Better reasoning** - Smarter meal planning and content creation
4. **Similar cost** - Sometimes cheaper than GPT-4
5. **More reliable** - Fewer errors and hallucinations

---

## **🔑 Summary - Get These 2 Keys:**

### 1. Claude/Anthropic API Key ⭐ REQUIRED
- **Link:** https://console.anthropic.com/
- **Cost:** $5 free credit, then ~$0.01 per request
- **Use:** All AI agents

### 2. USDA API Key ✅ FREE & REQUIRED
- **Link:** https://fdc.nal.usda.gov/api-key-signup.html
- **Cost:** FREE forever
- **Use:** Nutrition data for meal planning

---

## **✅ Quick Setup Commands**

```bash
# 1. Open .env file
cd /Users/jjohnson/Downloads/Mvoe/backend
nano .env

# 2. Add these lines:
ANTHROPIC_API_KEY="sk-ant-your-key-here"
USDA_API_KEY="your-usda-key-here"

# 3. Save and exit (Ctrl+X, then Y, then Enter)

# 4. Restart backend
npm run dev

# 5. Test agents
node src/tests/agent-integration-tests.js
```

---

## **🚀 Ready to Go!**

1. Get Claude key: https://console.anthropic.com/ (3 min)
2. Get USDA key: https://fdc.nal.usda.gov/api-key-signup.html (2 min)
3. Add both to `.env` file
4. Test: `node src/tests/agent-integration-tests.js`

**Claude is the correct API to use! Much better than OpenAI for your needs.** 🎯
