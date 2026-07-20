import test from 'node:test';
import assert from 'node:assert/strict';

import { extractGrantWriterJson, normalizeGrantWriterRequest } from '../agents/grantWriterAgent.js';

test('normalizeGrantWriterRequest fills required defaults', () => {
  const normalized = normalizeGrantWriterRequest({
    organizationName: 'Hope Pantry',
    projectNeed: 'Expand mobile food distribution',
  });

  assert.equal(normalized.organizationName, 'Hope Pantry');
  assert.equal(normalized.projectNeed, 'Expand mobile food distribution');
  assert.equal(normalized.location, 'United States');
  assert.equal(normalized.grantType, 'General operating or program support');
});

test('extractGrantWriterJson parses JSON wrapped in markdown fences', () => {
  const payload = extractGrantWriterJson(`\`\`\`json
  {
    "asOfDate": "2026-04-19",
    "organizationProfileSummary": "Summary",
    "opportunityScan": [],
    "recommendedTargets": ["CFPCGP"],
    "applicationChecklist": ["SAM registration"],
    "draftSections": {
      "executiveSummary": "Executive",
      "needStatement": "Need",
      "programDescription": "Program",
      "outcomesAndEvaluation": "Outcomes",
      "budgetNarrative": "Budget"
    },
    "sources": [{"label": "Grants.gov", "url": "https://www.grants.gov/applicants/applicant-registration.html"}],
    "warnings": ["Verify deadlines"]
  }
  \`\`\`
  `);

  assert.equal(payload.asOfDate, '2026-04-19');
  assert.equal(payload.recommendedTargets[0], 'CFPCGP');
  assert.equal(payload.draftSections.executiveSummary, 'Executive');
});

test('normalizeGrantWriterRequest preserves brand URLs for later ingestion', () => {
  const normalized = normalizeGrantWriterRequest({
    organizationName: 'Hope Pantry',
    projectNeed: 'Expand deliveries',
    websiteUrl: 'https://hopepantry.org',
    socialUrl: 'https://instagram.com/hopepantry',
  });

  assert.equal(normalized.websiteUrl, 'https://hopepantry.org');
  assert.equal(normalized.socialUrl, 'https://instagram.com/hopepantry');
});
