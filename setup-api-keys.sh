#!/bin/bash

# API Keys Setup Script for Mvoe Food Bank Platform
# This script helps you add API keys to your .env file

echo "🔑 API Keys Setup for Mvoe Platform"
echo "===================================="
echo ""

ENV_FILE="/Users/jjohnson/Downloads/Mvoe/backend/.env"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env file not found at $ENV_FILE"
    exit 1
fi

echo "✅ Found .env file"
echo ""

# Function to add or update env variable
update_env() {
    local key=$1
    local value=$2

    if grep -q "^${key}=" "$ENV_FILE"; then
        # Update existing
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=\"${value}\"|" "$ENV_FILE"
        else
            sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$ENV_FILE"
        fi
        echo "✅ Updated $key"
    else
        # Add new
        echo "${key}=\"${value}\"" >> "$ENV_FILE"
        echo "✅ Added $key"
    fi
}

# 1. OpenAI API Key
echo "📝 Step 1: OpenAI API Key (REQUIRED)"
echo "--------------------------------------"
echo "This is needed for ALL AI agents."
echo ""
echo "Get your key at: https://platform.openai.com/api-keys"
echo ""
read -p "Enter your OpenAI API key (or press Enter to skip): " OPENAI_KEY

if [ ! -z "$OPENAI_KEY" ]; then
    update_env "OPENAI_API_KEY" "$OPENAI_KEY"
    echo ""
else
    echo "⚠️  Skipped OpenAI key (AI agents won't work without it)"
    echo ""
fi

# 2. USDA API Key
echo "📝 Step 2: USDA API Key (FREE, Recommended)"
echo "--------------------------------------"
echo "Provides nutrition data for meal planning."
echo ""
echo "Get your key at: https://fdc.nal.usda.gov/api-key-signup.html"
echo ""
read -p "Enter your USDA API key (or press Enter to skip): " USDA_KEY

if [ ! -z "$USDA_KEY" ]; then
    update_env "USDA_API_KEY" "$USDA_KEY"
    echo ""
else
    echo "⚠️  Skipped USDA key (nutrition features will be limited)"
    echo ""
fi

# 3. Google API Key (Optional)
echo "📝 Step 3: Google Gemini API Key (OPTIONAL)"
echo "--------------------------------------"
echo "Alternative to OpenAI, often cheaper/free."
echo ""
echo "Get your key at: https://makersuite.google.com/app/apikey"
echo ""
read -p "Enter your Google API key (or press Enter to skip): " GOOGLE_KEY

if [ ! -z "$GOOGLE_KEY" ]; then
    update_env "GOOGLE_API_KEY" "$GOOGLE_KEY"
    echo ""
else
    echo "⏭️  Skipped Google API key"
    echo ""
fi

# 4. Mapbox API Key (Optional)
echo "📝 Step 4: Mapbox API Key (OPTIONAL)"
echo "--------------------------------------"
echo "For food bank maps and location features."
echo ""
echo "Get your key at: https://account.mapbox.com/access-tokens/"
echo ""
read -p "Enter your Mapbox API key (or press Enter to skip): " MAPBOX_KEY

if [ ! -z "$MAPBOX_KEY" ]; then
    update_env "MAPBOX_API_KEY" "$MAPBOX_KEY"
    echo ""
else
    echo "⏭️  Skipped Mapbox key"
    echo ""
fi

echo ""
echo "===================================="
echo "✅ Setup Complete!"
echo "===================================="
echo ""

# Check what's configured
echo "📊 Current Configuration:"
echo ""

if grep -q "^OPENAI_API_KEY=\"sk-" "$ENV_FILE"; then
    echo "✅ OpenAI API Key: Configured"
else
    echo "❌ OpenAI API Key: NOT configured (REQUIRED for AI agents)"
fi

if grep -q "^USDA_API_KEY=" "$ENV_FILE" && ! grep -q "^USDA_API_KEY=\"\"" "$ENV_FILE"; then
    echo "✅ USDA API Key: Configured"
else
    echo "⚠️  USDA API Key: Not configured (recommended)"
fi

if grep -q "^GOOGLE_API_KEY=" "$ENV_FILE" && ! grep -q "^GOOGLE_API_KEY=\"\"" "$ENV_FILE"; then
    echo "✅ Google API Key: Configured"
else
    echo "⏭️  Google API Key: Not configured (optional)"
fi

if grep -q "^MAPBOX_API_KEY=" "$ENV_FILE" && ! grep -q "^MAPBOX_API_KEY=\"\"" "$ENV_FILE"; then
    echo "✅ Mapbox API Key: Configured"
else
    echo "⏭️  Mapbox API Key: Not configured (optional)"
fi

echo ""
echo "📖 Full setup guide: /Users/jjohnson/Downloads/Mvoe/tasks/API-KEYS-SETUP-GUIDE.md"
echo ""

# Offer to test
echo "🧪 Would you like to test the AI agents now?"
read -p "Run tests? (y/n): " RUN_TESTS

if [ "$RUN_TESTS" = "y" ] || [ "$RUN_TESTS" = "Y" ]; then
    echo ""
    echo "Running agent tests..."
    cd /Users/jjohnson/Downloads/Mvoe/backend
    node src/tests/agent-integration-tests.js
else
    echo ""
    echo "To test later, run:"
    echo "  cd /Users/jjohnson/Downloads/Mvoe/backend"
    echo "  node src/tests/agent-integration-tests.js"
fi

echo ""
echo "✨ Done! Restart your backend server to use the new keys."
