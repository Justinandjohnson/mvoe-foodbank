# Grant Writer + Guest Meal Planner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the meal planner login wall safely and add a Grant Writer MVP that uses the existing MVOE agent architecture plus researched grant-writing guidance.

**Architecture:** Keep the existing dual-backend model: Node remains the orchestrator for queue-backed AI agents, and Python remains focused on volunteer-coordination APIs. Add a guest-safe path for the meal planner in the Node backend with rate limiting and isolated job ownership. Add a Grant Writer agent in the Node backend that uses Zen/Chrome DevTools MCP tools and grounded user inputs to generate grant opportunity briefs and section-by-section draft content.

**Tech Stack:** Fastify, BullMQ, Redis, React Native Web/Expo, Playwright, Node test runner, existing MCP clients (`zenClient`, `chromeDevToolsClient`)

---

### Task 1: Add guest-safe meal planner endpoints

**Files:**
- Modify: `backend/src/routes/agent.routes.js`
- Modify: `backend/src/queue/agentQueue.js`
- Test: `backend/src/tests/agentRoutesGuestMealPlanner.test.mjs`

**Step 1: Write the failing test**

Add a Node test that asserts a guest meal planner start endpoint accepts a prompt without auth, returns a `jobId` plus `accessToken`, and that the guest status endpoint rejects requests without the matching token.

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/agentRoutesGuestMealPlanner.test.mjs`
Expected: FAIL because the guest endpoints and token checks do not exist.

**Step 3: Write minimal implementation**

- Add `POST /api/agents/meal-planner/guest/start`
- Add `GET /api/agents/meal-planner/guest/status/:jobId`
- In queue helpers, support custom job metadata with `guestAccessToken` and `jobOwnerType: 'guest'`
- In status lookup, require a matching bearer/header token for guest jobs
- Add a small in-memory/IP rate limiter in the route (minimal YAGNI version; no global rewrite)

**Step 4: Run test to verify it passes**

Run: `node --test src/tests/agentRoutesGuestMealPlanner.test.mjs`
Expected: PASS

**Step 5: Run existing related tests**

Run: `node --test src/tests/mealPlannerAgent.test.mjs src/tests/zenClient.test.mjs src/tests/updateOrganizationSchema.test.mjs`
Expected: PASS

---

### Task 2: Remove frontend meal planner login wall and support guest jobs

**Files:**
- Modify: `frontend/src/api/agentService.js`
- Modify: `frontend/src/screens/MealPlannerScreen.js`
- Modify: `frontend/src/screens/AgentDashboardScreen.js`
- Test: `tests/e2e/meal-planner-guest.spec.ts`

**Step 1: Write the failing Playwright test**

Add an e2e test that opens the AI dashboard while logged out, enters the Meal Planner, submits a prompt as a guest, polls the guest status route, and renders the final plan.

**Step 2: Run test to verify it fails**

Run: `python3 "/Users/jjohnson/.claude/skills/webapp-testing/scripts/with_server.py" --server "python3 -m http.server 4173 --directory /Users/jjohnson/Downloads/Mvoe/frontend/dist" --port 4173 --timeout 30 -- npx playwright test tests/e2e/meal-planner-guest.spec.ts`
Expected: FAIL because the screen redirects to auth and guest API helpers do not exist.

**Step 3: Write minimal implementation**

- Add guest start/status helpers in `agentService.js`
- In `MealPlannerScreen`, replace the auth wall with a guest notice + submit path
- Store guest `jobId` + `accessToken` locally in component state only
- Keep authenticated users on the existing route path
- In `AgentDashboardScreen`, allow navigation to Meal Planner without auth

**Step 4: Run tests to verify pass**

Run:
- `npm run build:web`
- `python3 "/Users/jjohnson/.claude/skills/webapp-testing/scripts/with_server.py" --server "python3 -m http.server 4173 --directory /Users/jjohnson/Downloads/Mvoe/frontend/dist" --port 4173 --timeout 30 -- npx playwright test tests/e2e/meal-planner.spec.ts tests/e2e/meal-planner-guest.spec.ts`

Expected: PASS

---

### Task 3: Add Grant Writer agent backend job

**Files:**
- Create: `backend/src/agents/grantWriterAgent.js`
- Modify: `backend/src/workers/agentWorker.js`
- Modify: `backend/src/queue/agentQueue.js`
- Modify: `backend/src/routes/agent.routes.js`
- Test: `backend/src/tests/grantWriterAgent.test.mjs`

**Step 1: Write the failing test**

Add a Node test that asserts the Grant Writer agent can:
- normalize user/org inputs
- produce a structured output contract
- include `asOfDate`, `sources`, `opportunityFit`, and `draftSections`

Mock Zen/Chrome clients rather than making live external calls.

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/grantWriterAgent.test.mjs`
Expected: FAIL because the agent file and route do not exist.

**Step 3: Write minimal implementation**

- Create a `GrantWriterAgent` class modeled after `MealPlannerAgent`
- Use `zenClient` for synthesis and drafting
- Use `chromeDevToolsClient` only for lightweight grant-source research summaries/fallback discovery
- Require structured inputs: org profile, geography, program need, budget target, grant type
- Output sections:
  - `asOfDate`
  - `organizationProfileSummary`
  - `opportunityScan`
  - `recommendedTargets`
  - `applicationChecklist`
  - `draftSections` (`need`, `program`, `outcomes`, `budgetNarrative`)
  - `sources`
  - `warnings`
- Register the job in the queue/worker and add `POST /api/agents/grant-writer/start`

**Step 4: Run tests to verify pass**

Run: `node --test src/tests/grantWriterAgent.test.mjs`
Expected: PASS

---

### Task 4: Add Grant Writer frontend MVP screen

**Files:**
- Create: `frontend/src/screens/GrantWriterScreen.js`
- Modify: `frontend/src/navigation/AgentNavigator.js`
- Modify: `frontend/src/screens/AgentDashboardScreen.js`
- Modify: `frontend/src/api/agentService.js`
- Test: `tests/e2e/grant-writer.spec.ts`

**Step 1: Write the failing e2e test**

Add a Playwright test that:
- logs in
- opens Grant Writer from the AI dashboard
- fills the org/program form
- submits a mocked grant-writer job
- renders the structured result sections and sources

**Step 2: Run test to verify it fails**

Run the new Playwright test against the built frontend.
Expected: FAIL because the screen/route/API helper do not exist.

**Step 3: Write minimal implementation**

- Add Grant Writer as a live/authenticated agent card
- Create a form-first screen with fields for org name, mission, location, audience, project need, amount target, and grant type
- Submit to the new backend route and poll status
- Render structured result cards instead of raw JSON
- Show clear caveat text that live deadlines/eligibility still require source verification

**Step 4: Run tests to verify pass**

Run:
- `npm run build:web`
- `python3 "/Users/jjohnson/.claude/skills/webapp-testing/scripts/with_server.py" --server "python3 -m http.server 4173 --directory /Users/jjohnson/Downloads/Mvoe/frontend/dist" --port 4173 --timeout 30 -- npx playwright test tests/e2e/grant-writer.spec.ts`

Expected: PASS

---

### Task 5: End-to-end verification and local runbook update

**Files:**
- Modify: `README.md` (or `WEB-FIRST-DEPLOYMENT-GUIDE.md` if more appropriate)
- Test: existing local verification commands only

**Step 1: Verify all backend tests**

Run:
- `node --test src/tests/updateOrganizationSchema.test.mjs src/tests/zenClient.test.mjs src/tests/mealPlannerAgent.test.mjs src/tests/agentRoutesGuestMealPlanner.test.mjs src/tests/grantWriterAgent.test.mjs`
- `set -a; source .env; set +a; uv run pytest tests/test_config_helpers.py tests/test_openrouter_client.py tests/test_e2e.py -k "test_health or test_volunteers_list_empty or test_volunteer_summary_endpoint or test_reminder_draft_empty_event or test_agent_chat_real_openrouter"`

**Step 2: Verify frontend tests**

Run Playwright:
- `tests/e2e/demo-auth.spec.ts`
- `tests/e2e/meal-planner.spec.ts`
- `tests/e2e/meal-planner-guest.spec.ts`
- `tests/e2e/volunteer-coordinator.spec.ts`
- `tests/e2e/grant-writer.spec.ts`

**Step 3: Manual local smoke check**

Verify locally:
- guest Meal Planner opens and returns a plan
- logged-in Grant Writer opens and returns structured draft output
- donor login still works
- volunteer coordinator still works

**Step 4: Update runbook docs**

Document:
- local startup commands
- which env files are used
- guest meal planner limitations
- Grant Writer MVP limitations (research is advisory; deadlines/eligibility must be source-verified)
