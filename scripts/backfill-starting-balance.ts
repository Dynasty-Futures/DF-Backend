// =============================================================================
// Backfill: correct startingBalance / highWaterMark on existing accounts
// =============================================================================
// Accounts created by early account-discovery runs took startingBalance from
// YPF's unreliable `initialBalance` field, which skewed Closed P&L, drawdown,
// and progress-to-target. The true starting balance is the AccountType's face
// value (accountSize). This one-shot script re-anchors every account to its
// accountType.accountSize and lifts highWaterMark to max(start, current).
//
//   tsx scripts/backfill-starting-balance.ts --dry   # report only, no writes
//   tsx scripts/backfill-starting-balance.ts         # apply
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');

const main = async (): Promise<void> => {
  const accounts = await prisma.account.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      startingBalance: true,
      currentBalance: true,
      highWaterMark: true,
      platformAccountId: true,
      accountType: { select: { accountSize: true, name: true } },
    },
  });

  console.log(`${dry ? 'DRY RUN — ' : ''}scanning ${accounts.length} account(s)\n`);

  let changed = 0;
  for (const a of accounts) {
    const face = Number(a.accountType.accountSize);
    const current = Number(a.currentBalance);
    const oldStart = Number(a.startingBalance);
    const newHwm = Math.max(face, current);

    if (oldStart === face && Number(a.highWaterMark) >= newHwm) continue;

    changed++;
    console.log(
      `  • ${a.platformAccountId ?? a.id} (${a.accountType.name}): ` +
        `startingBalance ${oldStart} → ${face}, ` +
        `highWaterMark ${a.highWaterMark} → ${newHwm}`,
    );

    if (!dry) {
      await prisma.account.update({
        where: { id: a.id },
        data: { startingBalance: face, highWaterMark: newHwm },
      });
    }
  }

  console.log(`\n${dry ? 'would update' : 'updated'} ${changed} account(s)`);
};

main()
  .catch((err) => {
    console.error('backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
