// =============================================================================
// Account Discovery Runner (manual / one-shot)
// =============================================================================
// Lets us exercise the pull-based discovery flow on demand instead of waiting
// for the cron. Two modes:
//
//   tsx scripts/run-account-discovery.ts --dry   # READ-ONLY: list YPF tenant
//        accounts + show the match decision per account. Writes nothing.
//
//   tsx scripts/run-account-discovery.ts         # REAL: run discoverAccounts()
//        and create local Account/Challenge rows for newly-linked accounts.
//
// The YPF call (GET /tenant/accounts) is read-only either way; only the REAL
// mode writes — and only to the LOCAL database.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/index.js';
import { getTradingPlatformProvider } from '../src/providers/index.js';
import * as accountDiscoveryService from '../src/services/account-discovery.service.js';
import type { PlatformAccountResult } from '../src/providers/types.js';

const prisma = new PrismaClient();

const dry = process.argv.includes('--dry');

const inferPhase = (a: PlatformAccountResult): string =>
  a.nextProgramName ? 'EVALUATION' : 'FUNDED';

const dryRun = async (): Promise<void> => {
  const provider = getTradingPlatformProvider();
  const statuses = config.ypf.discovery.statuses;

  console.log(`\nDRY RUN — statuses: ${statuses.join(', ')}\n`);

  const seen = new Set<string>();
  for (const status of statuses) {
    const accounts = await provider.listTenantAccounts(status);
    console.log(`[${status}] ${accounts.length} account(s) from YPF`);

    for (const a of accounts) {
      if (seen.has(a.platformAccountId)) continue;
      seen.add(a.platformAccountId);

      const existing = await prisma.account.findUnique({
        where: { platformAccountId: a.platformAccountId },
        select: { id: true },
      });
      const email = a.email?.trim();
      const user = email
        ? await prisma.user.findFirst({
            where: {
              email: { equals: email, mode: 'insensitive' },
              deletedAt: null,
            },
            select: { id: true },
          })
        : null;
      const accountType = a.programId
        ? await prisma.accountType.findFirst({
            where: { ypfProgramId: a.programId },
            select: { id: true, name: true },
          })
        : null;

      let decision: string;
      if (existing) decision = 'SKIP — already linked locally';
      else if (!email) decision = 'SKIP — no email';
      else if (!user) decision = `SKIP — no DF user matches ${email}`;
      else if (!a.programId) decision = 'SKIP — no programId';
      else if (!accountType)
        decision = `SKIP — no AccountType for program ${a.programId}`;
      else decision = `WOULD CREATE → user ${user.id} / ${accountType.name}`;

      console.log(
        [
          `  • ${a.platformAccountId}`,
          `state=${a.status}`,
          `phase=${inferPhase(a)}`,
          `email=${email ?? '—'}`,
          `program=${a.programName ?? a.programId ?? '—'}`,
          `\n      → ${decision}`,
        ].join('  '),
      );
    }
  }
};

const main = async (): Promise<void> => {
  console.log(`YPF API: ${config.ypf.apiUrl}`);
  console.log(`Discovery enabled flag: ${config.ypf.discovery.enabled}`);

  if (dry) {
    await dryRun();
    return;
  }

  console.log('\nREAL RUN — creating local rows for newly-linked accounts...\n');
  const result = await accountDiscoveryService.discoverAccounts();
  console.log('\nResult:', JSON.stringify(result, null, 2));
};

main()
  .catch((err) => {
    console.error('account-discovery runner failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
