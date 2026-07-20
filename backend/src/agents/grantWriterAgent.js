// Grant Writer Agent - structured grant research and drafting for hunger-relief organizations
import ZenClient from '../mcp/zenClient.js';
import { GRANT_WRITER_EXAMPLES, GRANT_WRITER_SOURCES } from '../data/grantWriterKnowledge.js';
import { buildBrandIdentityProfile } from '../services/brandIdentityService.js';
import { getGrantIndexSnapshot, refreshGrantIndex } from '../services/grantIndexService.js';
import { inspectGrantPortal } from '../services/grantAutomationService.js';
import { recordAgentActivity } from '../services/agentActivityService.js';

export function extractGrantWriterJson(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Grant writer AI failed to return valid JSON');
  }

  const cleaned = jsonMatch[0]
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(cleaned);
}

export function normalizeGrantWriterRequest(request = {}) {
  return {
    mode: request.mode || 'draft',
    organizationName: request.organizationName?.trim() || 'Unknown Organization',
    mission: request.mission?.trim() || 'Mission details not provided.',
    location: request.location?.trim() || 'United States',
    populationServed: request.populationServed?.trim() || 'Community members facing food insecurity',
    projectNeed: request.projectNeed?.trim() || 'General hunger relief programming',
    amountTarget: request.amountTarget?.trim() || 'Not specified',
    grantType: request.grantType?.trim() || 'General operating or program support',
    websiteUrl: request.websiteUrl?.trim() || '',
    socialUrl: request.socialUrl?.trim() || '',
    existingPrograms: request.existingPrograms?.trim() || '',
    notes: request.notes?.trim() || '',
    applicationUrl: request.applicationUrl?.trim() || '',
    targetGrant: request.targetGrant || null,
  };
}

function buildGroundingContext(indexSnapshot, brandProfile) {
  const sourceLines = (indexSnapshot?.sources || []).map((source, index) => (
    `${index + 1}. ${source.label} (${source.category}) — ${source.url}
Summary: ${source.summary || source.note || 'No summary cached.'}`
  )).join('\n');

  const exampleLines = (indexSnapshot?.examples || GRANT_WRITER_EXAMPLES).map((example, index) => (
    `${index + 1}. ${example.title}: ${example.content}`
  )).join('\n');

  const brandSummary = brandProfile?.websiteProfile
    ? `Brand profile from website: ${brandProfile.websiteProfile.title || 'No title'} | ${brandProfile.websiteProfile.description || 'No description'} | ${brandProfile.websiteProfile.bodyText || 'No body text extracted.'}`
    : 'No website brand profile was provided.';

  return {
    sourceLines,
    exampleLines,
    brandSummary,
  };
}

function withReviewWarning(warnings = []) {
  const nextWarnings = Array.isArray(warnings) ? [...warnings] : [];
  if (!nextWarnings.includes('Verify live deadlines, eligibility, and funder instructions against the cited source before applying.')) {
    nextWarnings.push('Verify live deadlines, eligibility, and funder instructions against the cited source before applying.');
  }
  if (!nextWarnings.includes('Do not submit automatically. Stop for human review before the final submission click.')) {
    nextWarnings.push('Do not submit automatically. Stop for human review before the final submission click.');
  }
  return nextWarnings;
}

class GrantWriterAgent {
  constructor(socketIo) {
    this.io = socketIo;
    this.zenClient = new ZenClient();
  }

  buildOpportunityPrompt(request, groundingContext) {
    return `You are a nonprofit grant strategist for food banks and hunger-relief organizations.

Today is 2026-04-19.

Indexed grant source summaries:
${groundingContext.sourceLines}

Grant-writing examples and grounded patterns:
${groundingContext.exampleLines}

${groundingContext.brandSummary}

Organization context:
- Organization name: ${request.organizationName}
- Mission: ${request.mission}
- Location/service area: ${request.location}
- Population served: ${request.populationServed}
- Project need: ${request.projectNeed}
- Amount target: ${request.amountTarget}
- Grant type: ${request.grantType}
- Website URL: ${request.websiteUrl || 'Not provided'}
- Social URL: ${request.socialUrl || 'Not provided'}
- Existing programs: ${request.existingPrograms || 'Not provided'}
- Additional notes: ${request.notes || 'None'}

Requirements:
- Return ONLY valid JSON.
- Do not claim that a grant is currently open unless you mark it as needing live verification.
- Focus on fit analysis, not final prose drafting.

Return exactly this shape:
{
  "asOfDate": "2026-04-19",
  "organizationProfileSummary": "...",
  "opportunityScan": [
    {
      "programName": "...",
      "funderType": "federal|foundation|corporate|state|local",
      "whyItFits": "...",
      "whatToVerifyLive": "..."
    }
  ],
  "recommendedTargets": ["..."],
  "sources": [
    {"label": "...", "url": "..."}
  ],
  "warnings": ["..."]
}`;
  }

  buildDraftPrompt(request, scanResult, groundingContext) {
    return `You are a nonprofit grant writer for food banks and hunger-relief organizations.

Today is 2026-04-19.

Grounding context:
- Opportunity scan JSON: ${JSON.stringify(scanResult)}
- Organization context: ${JSON.stringify(request)}
- Indexed grant-writing examples: ${groundingContext.exampleLines}
- Brand summary: ${groundingContext.brandSummary}

Requirements:
- Return ONLY valid JSON.
- Draft concise, useful sections for a realistic grant application.
- Do not invent exact deadlines, funding windows, or submission statuses.
- Point the user back to source verification wherever anything dynamic matters.

Return exactly this shape:
{
  "applicationChecklist": ["..."],
  "draftSections": {
    "executiveSummary": "...",
    "needStatement": "...",
    "programDescription": "...",
    "outcomesAndEvaluation": "...",
    "budgetNarrative": "..."
  },
  "warnings": ["..."]
}`;
  }

  buildReviewPrompt(scanResult, draftResult) {
    return `You are a quality-control reviewer for AI-assisted grant drafting.

Review the following JSON objects and return ONLY valid JSON.

Opportunity scan: ${JSON.stringify(scanResult)}
Draft result: ${JSON.stringify(draftResult)}

Your job:
- Remove overclaims
- Ensure the warnings are explicit about live verification
- Make sure the checklist is specific and practical

Return exactly this shape:
{
  "applicationChecklist": ["..."],
  "draftSections": {
    "executiveSummary": "...",
    "needStatement": "...",
    "programDescription": "...",
    "outcomesAndEvaluation": "...",
    "budgetNarrative": "..."
  },
  "warnings": ["..."]
}`;
  }

  buildSearchPrompt(request, groundingContext) {
    return `You are a grant opportunity ranking agent for hunger-relief organizations.

Today is 2026-04-19.

Indexed grant source summaries:
${groundingContext.sourceLines}

Grant-writing examples and grounded patterns:
${groundingContext.exampleLines}

${groundingContext.brandSummary}

Organization context: ${JSON.stringify(request)}

Requirements:
- Return ONLY valid JSON.
- Produce the best 20 opportunities from the grounded source context.
- Do not claim a grant is currently open; use whatToVerifyLive for dynamic items.
- Include an applicationUrl only if you can ground it to one of the indexed/cited sources.

Return exactly this shape:
{
  "asOfDate": "2026-04-19",
  "searchResults": [
    {
      "rank": 1,
      "programName": "...",
      "funderType": "federal|foundation|corporate|state|local",
      "portalType": "grants.gov|submittable|fluxx|smartsimple|downloadable-form|generic-web-form",
      "applicationUrl": "...",
      "whyItFits": "...",
      "whatToVerifyLive": "...",
      "sourceLabel": "..."
    }
  ],
  "warnings": ["..."]
}`;
  }

  buildPreparationPrompt(request, targetGrant, portalInspection, groundingContext) {
    return `You are a browser-assisted grant application preparation agent.

Today is 2026-04-19.

Organization context: ${JSON.stringify(request)}
Selected grant: ${JSON.stringify(targetGrant)}
Portal inspection: ${JSON.stringify(portalInspection)}
Brand context: ${groundingContext.brandSummary}
Grant-writing examples: ${groundingContext.exampleLines}

Requirements:
- Return ONLY valid JSON.
- Prepare a browser-first application plan.
- Distinguish supported-portal workflows from generic best-effort browser workflows.
- Include a pre-submit human review stop.
- Mention uploads/download workflow if the portal looks document-first.

Return exactly this shape:
{
  "automationPlan": {
    "portalType": "...",
    "automationMode": "supported-portal|best-effort-browser|document-first",
    "reviewBeforeSubmit": true,
    "fieldMappingHints": ["..."],
    "requiredUploads": ["..."],
    "stepPlan": ["..."],
    "preSubmitChecklist": ["..."]
  },
  "warnings": ["..."]
}`;
  }

  async runStructuredJsonStep(sessionId, prompt, progressMessage, jobData = {}) {
    await this.emitProgress(sessionId, progressMessage, jobData);

    const response = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 2200,
      systemPrompt: 'You are a precise, citation-oriented grant writing strategist. Return JSON only.',
    });

    if (!response.success || !response.text) {
      throw new Error(response.error || 'Grant writer AI call failed');
    }

    return extractGrantWriterJson(response.text);
  }

  async execute(jobData) {
    const normalizedRequest = normalizeGrantWriterRequest(jobData.request);
    const mode = normalizedRequest.mode || 'draft';
    const [indexSnapshot, brandProfile] = await Promise.all([
      mode === 'search' ? refreshGrantIndex() : getGrantIndexSnapshot(),
      buildBrandIdentityProfile(normalizedRequest),
    ]);
    const groundingContext = buildGroundingContext(indexSnapshot, brandProfile);

    if (mode === 'search') {
      const searchResult = await this.runStructuredJsonStep(
        jobData.sessionId,
        this.buildSearchPrompt(normalizedRequest, groundingContext),
        '🔍 Searching and ranking the best grounded grant opportunities...',
        jobData
      );

      const result = {
        success: true,
        grantSearch: {
          asOfDate: '2026-04-19',
          searchResults: searchResult.searchResults || [],
          warnings: withReviewWarning(searchResult.warnings),
          indexMetadata: {
            refreshedAt: indexSnapshot.refreshedAt,
            sourceCount: indexSnapshot.sourceCount,
          },
        },
      };

      await this.emitComplete(jobData.sessionId, result, jobData);
      return result;
    }

    if (mode === 'prepare-application') {
      const portalInspection = await inspectGrantPortal(normalizedRequest.applicationUrl || normalizedRequest.targetGrant?.applicationUrl || '');
      const prepResult = await this.runStructuredJsonStep(
        jobData.sessionId,
        this.buildPreparationPrompt(normalizedRequest, normalizedRequest.targetGrant || {}, portalInspection, groundingContext),
        '🧭 Preparing a browser-assisted application plan with review-before-submit safeguards...',
        jobData
      );

      const result = {
        success: true,
        applicationPreparation: {
          portalInspection,
          automationPlan: prepResult.automationPlan,
          warnings: withReviewWarning(prepResult.warnings),
        },
      };

      await this.emitComplete(jobData.sessionId, result, jobData);
      return result;
    }

    const scanResult = await this.runStructuredJsonStep(
      jobData.sessionId,
      this.buildOpportunityPrompt(normalizedRequest, groundingContext),
      '🔎 Scanning grant-fit patterns and grounded funding channels...',
      jobData
    );

    const draftResult = await this.runStructuredJsonStep(
      jobData.sessionId,
      this.buildDraftPrompt(normalizedRequest, scanResult, groundingContext),
      '🧠 Drafting structured grant sections from the fit analysis...',
      jobData
    );

    const reviewedDraft = await this.runStructuredJsonStep(
      jobData.sessionId,
      this.buildReviewPrompt(scanResult, draftResult),
      '🛡️ Reviewing the draft for groundedness, caution language, and compliance gaps...',
      jobData
    );

    const parsed = {
      asOfDate: '2026-04-19',
      organizationProfileSummary: scanResult.organizationProfileSummary,
      brandProfile,
      opportunityScan: scanResult.opportunityScan,
      recommendedTargets: scanResult.recommendedTargets,
      applicationChecklist: reviewedDraft.applicationChecklist,
      draftSections: reviewedDraft.draftSections,
      sources: Array.isArray(scanResult.sources) && scanResult.sources.length > 0 ? scanResult.sources : GRANT_WRITER_SOURCES,
      warnings: withReviewWarning(reviewedDraft.warnings),
      indexMetadata: {
        refreshedAt: indexSnapshot.refreshedAt,
        sourceCount: indexSnapshot.sourceCount,
      },
    };

    const result = {
      success: true,
      grantBrief: parsed,
    };

    await this.emitComplete(jobData.sessionId, result, jobData);
    return result;
  }

  async emitProgress(sessionId, message, jobData = {}) {
    const payload = {
      type: 'progress',
      agentType: 'grant-writer',
      sessionId,
      message,
      timestamp: new Date().toISOString(),
    };

    if (this.io?.to && typeof this.io.emit === 'function') {
      this.io.to(sessionId).emit('agent:progress', payload);
      this.io.emit('agent:progress', payload);
    }

    if (typeof jobData?.onProgress === 'function') {
      await jobData.onProgress(payload);
    }

    recordAgentActivity({
      action: 'AGENT_PROGRESS',
      entityId: sessionId,
      details: { agentType: 'grant-writer', message },
    });
  }

  async emitComplete(sessionId, result, jobData = {}) {
    const payload = {
      type: 'complete',
      agentType: 'grant-writer',
      sessionId,
      result,
      timestamp: new Date().toISOString(),
    };

    if (this.io?.to && typeof this.io.emit === 'function') {
      this.io.to(sessionId).emit('agent:complete', payload);
      this.io.emit('agent:complete', payload);
    }

    if (typeof jobData?.onComplete === 'function') {
      await jobData.onComplete(payload);
    }

    recordAgentActivity({
      action: 'AGENT_COMPLETE',
      entityId: sessionId,
      details: { agentType: 'grant-writer' },
    });
  }
}

export default GrantWriterAgent;
