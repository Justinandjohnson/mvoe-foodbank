import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:4173';

function buildClientSideJwt() {
  const payload = {
    sub: 'test-user-id',
    tenant_id: 'test-tenant-id',
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };

  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('authenticated user can search grants, draft a grant, and prepare an application review plan', async ({ page }) => {
  const fakeToken = buildClientSideJwt();

  await page.addInitScript(({ token }) => {
    localStorage.setItem('secure_accessToken', token);
    localStorage.setItem('secure_refreshToken', 'refresh-token');
    localStorage.setItem('user', JSON.stringify({
      id: 'test-user-id',
      fullName: 'Demo Director',
      email: 'director@mvoe-test.com',
      userType: 'staff',
    }));
  }, { token: fakeToken });

  const jobPollCounts = {
    search: 0,
    draft: 0,
    prep: 0,
  };

  await page.route('**/api/agents/active', async (route) => {
    await route.fulfill({ json: { success: true, jobs: [] } });
  });

  await page.route('**/api/agents/grant-writer/index-status', async (route) => {
    await route.fulfill({ json: { success: true, snapshot: { refreshedAt: '2026-04-19T10:00:00.000Z', sourceCount: 5 } } });
  });

  await page.route('**/api/agents/grant-writer/index-refresh', async (route) => {
    await route.fulfill({ json: { success: true, snapshot: { refreshedAt: '2026-04-19T11:00:00.000Z', sourceCount: 5 } } });
  });

  await page.route('**/api/agents/grant-writer/start', async (route) => {
    const body = route.request().postDataJSON();
    const mode = body.request?.mode || 'draft';
    const jobId = mode === 'search' ? 'grant-search-job' : mode === 'prepare-application' ? 'grant-prep-job' : 'grant-draft-job';

    await route.fulfill({
      json: {
        success: true,
        jobId,
        status: 'queued',
      },
    });
  });

  await page.route('**/api/agents/status/*', async (route) => {
    const url = route.request().url();

    if (url.includes('grant-search-job')) {
      jobPollCounts.search += 1;
      if (jobPollCounts.search < 2) {
        await route.fulfill({ json: { success: true, status: 'active' } });
        return;
      }
      await route.fulfill({
        json: {
          success: true,
          status: 'completed',
          result: {
            grantSearch: {
              asOfDate: '2026-04-19',
              indexMetadata: { refreshedAt: '2026-04-19T11:00:00.000Z', sourceCount: 5 },
              warnings: ['Verify live deadlines, eligibility, and funder instructions against the cited source before applying.'],
              searchResults: Array.from({ length: 20 }, (_, index) => ({
                rank: index + 1,
                programName: index === 0 ? 'Community Food Projects Competitive Grant Program' : `Grant Option ${index + 1}`,
                funderType: index === 0 ? 'federal' : 'foundation',
                portalType: index === 0 ? 'grants.gov' : 'generic-web-form',
                applicationUrl: index === 0 ? 'https://www.grants.gov/search-results-detail/12345' : `https://example.org/grants/${index + 1}`,
                whyItFits: 'Strong fit for community hunger-relief delivery programs.',
                whatToVerifyLive: 'Deadline, eligibility, and submission instructions.',
                sourceLabel: 'USDA NIFA CFPCGP',
              })),
            },
          },
        },
      });
      return;
    }

    if (url.includes('grant-prep-job')) {
      jobPollCounts.prep += 1;
      if (jobPollCounts.prep < 2) {
        await route.fulfill({ json: { success: true, status: 'active' } });
        return;
      }
      await route.fulfill({
        json: {
          success: true,
          status: 'completed',
          result: {
            applicationPreparation: {
              portalInspection: {
                portalType: 'grants.gov',
                portalSummary: 'Federal grants portal with attachment uploads and a final review step.',
              },
              automationPlan: {
                automationMode: 'supported-portal',
                stepPlan: ['Open application page', 'Fill organization/contact fields', 'Attach grant narrative draft', 'Pause on review screen'],
                preSubmitChecklist: ['Confirm all attachments uploaded', 'Review every dynamic answer', 'Do not click final submit without approval'],
                fieldMappingHints: ['Organization name -> Hope Pantry', 'Need statement -> generated narrative'],
                requiredUploads: ['Grant narrative PDF', 'Budget narrative attachment'],
              },
              warnings: ['Do not submit automatically. Stop for human review before the final submission click.'],
            },
          },
        },
      });
      return;
    }

    jobPollCounts.draft += 1;
    if (jobPollCounts.draft < 2) {
      await route.fulfill({ json: { success: true, status: 'active' } });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        status: 'completed',
        result: {
          grantBrief: {
            asOfDate: '2026-04-19',
            indexMetadata: { refreshedAt: '2026-04-19T11:00:00.000Z', sourceCount: 5 },
            organizationProfileSummary: 'Hope Pantry is a community food bank serving families across Austin, Texas.',
            brandProfile: {
              websiteProfile: {
                title: 'Hope Pantry',
                description: 'Serving Austin families with community-powered food access.',
              },
            },
            recommendedTargets: ['CFPCGP', 'Walmart Foundation'],
            applicationChecklist: ['Confirm UEI/SAM registration', 'Collect board-approved budget'],
            opportunityScan: [
              {
                programName: 'Community Food Projects Competitive Grant Program',
                funderType: 'federal',
                whyItFits: 'Supports community-based food access projects with measurable outcomes.',
                whatToVerifyLive: 'Current NOFO deadline and match requirements.',
              },
            ],
            draftSections: {
              executiveSummary: 'This proposal expands mobile food distribution to underserved families.',
              needStatement: 'Rising pantry demand has outpaced current delivery capacity.',
              programDescription: 'The organization will add one refrigerated van and weekly pop-up distributions.',
              outcomesAndEvaluation: 'Track households served, food pounds delivered, and repeat participation.',
              budgetNarrative: 'Funds support van leasing, fuel, and part-time logistics coordination.',
            },
            sources: [
              {
                label: 'Grants.gov Applicant Registration',
                url: 'https://www.grants.gov/applicants/applicant-registration.html',
              },
            ],
            warnings: ['Verify live deadlines, eligibility, and funder instructions against the cited source before applying.'],
          },
        },
      },
    });
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('AI Agents').click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Open Grant Writer' }).click();
  await page.waitForTimeout(1000);

  await page.getByPlaceholder('Enter organization name').fill('Hope Pantry');
  await page.getByPlaceholder('Enter project need').fill('Expand mobile food delivery for homebound seniors');
  await page.getByPlaceholder('Enter mission').fill('Fight hunger with community-powered food access.');
  await page.getByPlaceholder('Enter location / service area').fill('Austin, Texas');
  await page.getByRole('button', { name: 'Search top grants' }).click();
  await expect(page.getByText('Top 20 Grants')).toBeVisible();
  await expect(page.getByText(/Community Food Projects Competitive Grant Program/i)).toBeVisible();
  await page.getByRole('button', { name: 'Select Community Food Projects Competitive Grant Program' }).click();
  await page.getByRole('button', { name: 'Run Grant Writer' }).click();

  await expect(page.getByText('Grant Writer Result')).toBeVisible();
  await expect(page.getByText(/Hope Pantry is a community food bank/i)).toBeVisible();
  await expect(page.getByText(/CFPCGP/i)).toBeVisible();

  await page.getByRole('button', { name: 'Prepare application review' }).click();
  await expect(page.getByText('Application Review Plan')).toBeVisible();
  await expect(page.getByText(/Federal grants portal/i)).toBeVisible();
});
