# OpenAI Image Generation Integration - Implementation Plan

## Research Summary (November 2, 2025)

### Latest OpenAI Image Models Available:

Based on Context7 OpenAI Platform documentation research:

1. **gpt-image-1** (NEWEST - 2025)
   - Latest and most advanced image generation model
   - Max prompt length: 32,000 characters (massive improvement!)
   - Sizes: 1024x1024, 1536x1024, 1024x1536, or 'auto'
   - Quality: 'high', 'medium', 'low', or 'auto'
   - Output formats: PNG, JPEG, WebP
   - Background control: 'transparent', 'opaque', or 'auto'
   - Compression control: 0-100% for JPEG/WebP
   - Streaming support: Yes (with partial_images parameter)
   - Moderation: 'low' or 'auto'
   - Always returns base64-encoded images

2. **dall-e-3** (Previous generation)
   - Max prompt length: 4,000 characters
   - Sizes: 1024x1024, 1792x1024, 1024x1792
   - Quality: 'hd' or 'standard'
   - Style: 'vivid' or 'natural'
   - Response format: 'url' or 'b64_json'
   - Only n=1 supported (single image)

3. **dall-e-2** (Legacy)
   - Max prompt length: 1,000 characters
   - Sizes: 256x256, 512x512, 1024x1024
   - Quality: 'standard' only
   - Can generate multiple images (n=1-10)

### Key Findings:

- **gpt-image-1 is the recommended model** for professional design work
- Supports much longer prompts (32K chars vs 4K for DALL-E 3)
- Better quality control and output format options
- Streaming capability for faster previews
- Transparent backgrounds for design work
- Current MCP client already configured but using outdated parameters

## Implementation Tasks

### Phase 1: Update ImageClient for Latest Models ✅ READY TO IMPLEMENT

- [ ] Update imageClient.js to use gpt-image-1 as default model
- [ ] Add support for new gpt-image-1 parameters:
  - [ ] background (transparent/opaque/auto)
  - [ ] output_format (png/jpeg/webp)
  - [ ] output_compression (0-100)
  - [ ] moderation (low/auto)
  - [ ] stream (boolean)
  - [ ] partial_images (0-3)
- [ ] Keep backward compatibility with DALL-E 3 and 2
- [ ] Update default quality from 'high' to 'auto' for gpt-image-1
- [ ] Update size options to support 'auto'

### Phase 2: Create AI Prompt Generator System ✅ READY TO IMPLEMENT

- [ ] Create new MCP client: promptGeneratorClient.js
  - [ ] Use ZenClient (supports both Claude & OpenAI)
  - [ ] Create specialized prompts for design generation
  - [ ] Support different design types (flyer, social media, newsletter, blog)
  
- [ ] Implement prompt optimization methods:
  - [ ] generateFlyerPrompt(userIdea, designSpecs) - converts idea to optimized prompt
  - [ ] generateSocialPrompt(platform, message, style)
  - [ ] generateNewsletterPrompt(title, theme, mood)
  - [ ] generateBlogImagePrompt(topic, article, keywords)
  - [ ] enhancePrompt(basicPrompt) - adds professional design language

- [ ] Add design expertise to prompts:
  - [ ] Typography recommendations
  - [ ] Color theory
  - [ ] Layout principles
  - [ ] Brand consistency
  - [ ] Platform-specific best practices

### Phase 3: Integrate with ContentCreationAgent ✅ READY TO IMPLEMENT

- [ ] Update ContentCreationAgent.js available tools:
  - [ ] Add 'generate_optimized_prompt' tool
  - [ ] Update image generation tools to use prompt generator first
  - [ ] Keep direct generation for advanced users

- [ ] Create two-step generation workflow:
  - Step 1: AI generates optimized prompt from user idea
  - Step 2: OpenAI generates image from optimized prompt
  
- [ ] Add prompt preview/editing capability:
  - [ ] Return generated prompt to user before image generation
  - [ ] Allow user to modify prompt
  - [ ] Store successful prompts for learning

### Phase 4: Add Design Template System ✅ READY TO IMPLEMENT

- [ ] Create design templates for common use cases:
  - [ ] Event flyers (community meals, fundraisers, volunteer drives)
  - [ ] Social media posts (Instagram square, Facebook header, Twitter card)
  - [ ] Newsletter headers (monthly updates, impact reports)
  - [ ] Blog featured images (storytelling, data visualization)

- [ ] Implement template-based prompt generation:
  - [ ] Load template structure
  - [ ] Fill template with user content
  - [ ] Apply design rules
  - [ ] Generate final prompt

### Phase 5: Testing & Optimization ✅ READY TO IMPLEMENT

- [ ] Create test suite for image generation:
  - [ ] Test gpt-image-1 with various prompts
  - [ ] Test transparent backgrounds
  - [ ] Test different output formats
  - [ ] Test streaming (if needed)
  - [ ] Compare gpt-image-1 vs DALL-E 3 quality

- [ ] Test prompt generator:
  - [ ] Generate prompts for all design types
  - [ ] Validate prompt optimization
  - [ ] Test with real user ideas
  - [ ] Measure improvement in output quality

- [ ] Performance testing:
  - [ ] Image generation speed
  - [ ] Prompt generation speed
  - [ ] End-to-end workflow
  - [ ] Cost analysis (tokens used)

## Architecture Overview

### Current System (MCP Methodology):
```
User Request → ContentCreationAgent → ZenClient (AI Decision) → ImageClient (MCP) → OpenAI API
```

### New System with Prompt Generator:
```
User Idea → ContentCreationAgent 
          → ZenClient (Decides: generate prompt first)
          → PromptGenerator (ZenClient with specialized prompts)
          → Returns optimized prompt
          → ImageClient (MCP with gpt-image-1 parameters)
          → OpenAI API
          → Returns base64 image
```

### Key MCP Principles Maintained:
1. ✅ AI orchestration (ZenClient decides which tools to use)
2. ✅ No direct JavaScript implementation (use MCP clients)
3. ✅ Tool-based architecture (agents use available tools)
4. ✅ Modular design (each client is independent)

## Security Considerations

- [ ] Validate all user inputs before prompt generation
- [ ] Sanitize prompts to prevent injection attacks
- [ ] Never expose API keys in frontend
- [ ] Store images securely (S3 or similar)
- [ ] Implement rate limiting on image generation
- [ ] Add content moderation checks
- [ ] Log all generation requests for audit

## File Changes Required

### New Files:
1. `/backend/src/mcp/promptGeneratorClient.js` - AI prompt generator
2. `/backend/src/templates/designTemplates.js` - Design templates
3. `/backend/src/tests/test-image-generation-2025.js` - Test suite

### Modified Files:
1. `/backend/src/mcp/imageClient.js` - Update for gpt-image-1
2. `/backend/src/agents/contentCreationAgent.js` - Add prompt generation
3. `/backend/src/mcp/zenClient.js` - Add design-specific system prompts (if needed)

## Cost Estimates

### OpenAI Pricing (as of 2025):
- gpt-image-1: Premium pricing (better quality)
- DALL-E 3: $0.04 - $0.08 per image
- Prompt generation: ~$0.01 per request (using GPT-4o-mini)

### Total per image: ~$0.05 - $0.09
- More expensive but MUCH better quality for professional designs

## Next Steps

1. ✅ Research complete - Latest models identified
2. ⏭️ User approval - Wait for confirmation
3. ⏭️ Implementation - Update imageClient.js
4. ⏭️ Create prompt generator
5. ⏭️ Integration with ContentCreationAgent
6. ⏭️ Testing with real designs
7. ⏭️ Documentation and examples

## Questions for User

- Confirm this approach aligns with your vision?
- Any specific design types you want to prioritize?
- Should we keep DALL-E 3 as fallback option?
- Do you want streaming support (partial images)?
- Any specific brand guidelines to incorporate?

---

**Status**: ✅ Research Complete - Ready for Implementation
**Date**: November 2, 2025
**Researcher**: Claude Code AI Agent
