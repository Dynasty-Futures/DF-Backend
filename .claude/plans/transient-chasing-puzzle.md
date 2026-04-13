# Trading Rules Engine — Implementation Plan

## Context
Volumetrica enforces trading rules natively. Our job is to **push rule configs at provisioning** and **sync state back** via webhooks + polling. Step 1 (provider-level `createTradingRule`, `getTradingRule`, `listTradingRules`, `assignTradingRule`) is done. Steps 2–6 build the service layer, schema changes, webhooks, transitions, and background sync.

## Step 1: TradingRule Provider Methods — DONE
Committed in `1ca9aea`.

---

## Step 2: Rule Mapping Service
**File**: `src/services/rule-mapping.service.ts` (NEW)

Maps a `ChallengeRule` + `AccountType.accountSize` → `CreatePlatformTradingRuleParams`.

Logic:
- Convert percentages to dollars: `profitTarget% × accountSize`, `maxDailyLoss% × accountSize`, `maxTotalDrawdown% × accountSize`
- `drawdownType`: `"trailing"` → mode `0`, `"static"` → mode `1`
- `maxDrawdownAction` / `intradayMaxDrawdownAction`: always `1` (ChallengeFail)
- `profitTargetAction`: `1` (ChallengeSuccess) if `profitTarget > 0`, else `0` (None)
- `consistencyPercentual`: `maxSingleDayProfit` value if `consistencyRule` is true, else `undefined`
- `minSessionNumbers`: `minTradingDays` if > 0, else `undefined`
- `newsRestrictionAction`: `4` (IntradayDisable) if `newsRestriction` is true, else `0`
- `overweekendAction`: `4` (IntradayDisable) if `weekendRestriction` is true, else `0`
- `name`: e.g. `"STANDARD_25K_PHASE_1"`
- `organizationReferenceId`: `challengeRule.id` (idempotency key)

Export: `mapChallengeRuleToTradingParams(rule: ChallengeRule, accountSize: number): CreatePlatformTradingRuleParams`

Register in `src/services/index.ts`.

**Tests**: `src/services/__tests__/rule-mapping.service.test.ts` — unit test the mapping with known seed values (Standard 25K Phase 1: $1500 profit target, $750 daily loss, $1500 max drawdown trailing, consistency 50%).

---

## Step 3: Schema Migration + Provisioning Wiring
**Schema change** in `prisma/schema.prisma`:
- Add `platformRuleId String? @map("platform_rule_id")` to `ChallengeRule` model

**Migration**: `npm run db:migrate` → name: `add_platform_rule_id`

**Provisioning change** in `src/services/challenge.service.ts`:
After creating the platform account (line ~144), before the DB transaction:
1. Look up `phaseRules.platformRuleId` — if already set, use it
2. If not set, call `ruleMappingService.mapChallengeRuleToTradingParams()` then `provider.createTradingRule()`, store `platformRuleId` on the ChallengeRule
3. Call `provider.assignTradingRule(platformAccountId, platformRuleId)`

This is lazy — rules are created on first use and cached via `platformRuleId`. Avoids a separate sync-all-rules step.

---

## Step 4: Challenge Phase Transition Service
**File**: `src/services/challenge-transition.service.ts` (NEW)

Functions:
- `failChallenge(accountId, reason, violationDetails?)` — sets Challenge status to FAILED, Account status to FAILED, records `failedAt` + `failedReason`, creates `RuleViolation` record
- `advanceChallenge(accountId)` — for PHASE_1 → FUNDED (Standard/Advanced):
  1. Mark current Challenge as PASSED
  2. Update Account status to FUNDED, set `passedAt` + `fundedAt`
  3. Look up FUNDED phase ChallengeRule, create new Challenge record
  4. Create/assign new Volumetrica trading rule for FUNDED phase (no profit target, static drawdown)

Register in `src/services/index.ts`.

**Tests**: `src/services/__tests__/challenge-transition.service.test.ts` — mock Prisma + provider, verify state transitions + rule assignment.

---

## Step 5: Volumetrica Webhook Endpoint
**Config**: Add `VOLUMETRICA_WEBHOOK_SECRET` to `src/config/index.ts`

**Route**: `src/api/routes/webhooks-volumetrica.ts` (NEW)
- Mount in `src/app.ts` at `/webhooks/volumetrica` BEFORE `express.json()` (same pattern as Stripe)
- Verify signature using HMAC (or whatever Volumetrica uses)

**Service**: `src/services/volumetrica-webhook.service.ts` (NEW)
- Handle events: `rule.triggered` → call `challengeTransitionService.failChallenge()` or `.advanceChallenge()`
- Handle events: `account.updated` → sync account data via `syncService`

Register in `src/services/index.ts`.

Note: Exact webhook payload shape TBD — we'll scaffold the handler and fill in when Volumetrica docs confirm the event format.

---

## Step 6: Background Sync Job
**Dependency**: `node-cron`

**Files**:
- `src/jobs/index.ts` (NEW) — job registry, starts all cron jobs
- `src/jobs/rule-sync.job.ts` (NEW) — periodic polling

Job logic:
1. Call `provider.getBulkAccountsEnabled()` to get all active accounts
2. For each account, compare platform state vs local DB state
3. Detect rule violations (drawdown breached, profit target hit) that webhooks may have missed
4. Call transition service as needed

Schedule: every 5 minutes in production, configurable via env.

Wire into `src/server.ts` to start jobs on server boot.

---

## Verification
- `npm run typecheck` — zero errors
- `npm run lint` — zero errors
- `npm test` — all tests pass
- Manual: trace the provisioning flow end-to-end in logs

## Files to Create/Modify
| Action | File |
|--------|------|
| CREATE | `src/services/rule-mapping.service.ts` |
| CREATE | `src/services/__tests__/rule-mapping.service.test.ts` |
| CREATE | `src/services/challenge-transition.service.ts` |
| CREATE | `src/services/__tests__/challenge-transition.service.test.ts` |
| CREATE | `src/api/routes/webhooks-volumetrica.ts` |
| CREATE | `src/services/volumetrica-webhook.service.ts` |
| CREATE | `src/jobs/index.ts` |
| CREATE | `src/jobs/rule-sync.job.ts` |
| MODIFY | `prisma/schema.prisma` — add `platformRuleId` to ChallengeRule |
| MODIFY | `src/services/challenge.service.ts` — wire rule creation + assignment |
| MODIFY | `src/services/index.ts` — export new services |
| MODIFY | `src/config/index.ts` — add `VOLUMETRICA_WEBHOOK_SECRET` |
| MODIFY | `src/app.ts` — mount Volumetrica webhook route |
| MODIFY | `src/server.ts` — start cron jobs |
