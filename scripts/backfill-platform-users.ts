// =============================================================================
// Backfill: pre-create YPF users for existing DF users (no platformUserId)
// =============================================================================
// Users who signed up BEFORE YPF auto-create (YPF_AUTO_CREATE_USERS) went live
// have a DF account but no YPF presence (platformUserId IS NULL, no accounts),
// so they can't be recognised by YPF / log into the YPF-hosted dashboard.
//
// This one-shot reuses the app's own `createPlatformUser` (same path the signup
// auto-create uses) to register each targeted user on YPF and write back
// platformUserId. It does NOT provision a trading account — register only.
//
// SAFETY:
//   - Operates ONLY on the explicit TARGETS list below (or emails passed as
//     args) — never a blanket sweep. Admin/test/junk rows stay out by omission.
//   - Skips users already linked (createPlatformUser throws ConflictError),
//     soft-deleted, or not found — logged, never fatal.
//   - Per-user try/catch: one YPF failure doesn't abort the rest.
//   - Creating a YPF user is outward-facing and not trivially reversible, so run
//     --dry first and confirm the resolved list before the real run.
//
// Must run INSIDE the VPC (prod DB is private) — i.e. as an ECS one-off task
// against the prod task def, same as the seed jobs:
//   aws ecs run-task ... --overrides command=["npx","tsx",
//     "scripts/backfill-platform-users.ts"]
//
//   tsx scripts/backfill-platform-users.ts --dry            # report only
//   tsx scripts/backfill-platform-users.ts                  # apply TARGETS
//   tsx scripts/backfill-platform-users.ts a@x.com b@y.com  # apply given emails
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { createPlatformUser } from '../src/services/user.service.js';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');

// Pre-YPF traders to back-fill: every real trader signup with no YPF user,
// EXCLUDING the 2 admin and 3 test/spam rows by design. Includes unverified
// (PENDING_VERIFICATION) signups — consistent with auto-create, which also
// fires before email verification. Override by passing explicit emails as args.
const TARGETS: string[] = [
  // ACTIVE (Google) — verified real traders
  'treypkelly@gmail.com',
  'ariszajaczkowski@gmail.com',
  'berniehiett@gmail.com',
  'contactbrushpacker@gmail.com',
  'crdiablo1@gmail.com',
  'jon@fulltimetraderpro.com',
  'xx323f23@gmail.com',
  'djdn06676@gmail.com',
  // PENDING_VERIFICATION (password) — never confirmed email; may bounce
  'scotty.pitzele@gmail.com',
  'andinofcb@hotmail.com',
  'dan.adam922@gmail.com',
  'randy_w_smith@outlook.com',
  'learn55511@gmail.com',
  'viankawhite@gmail.com',
  'harshpatel6511@icloud.com',
  'icecubefx12@gmail.com',
  'treyprestonkelly@icloud.com',
];

const main = async (): Promise<void> => {
  const argEmails = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const emails = argEmails.length > 0 ? argEmails : TARGETS.map((e) => e.toLowerCase());

  console.log(
    `${dry ? 'DRY RUN — ' : ''}backfilling ${emails.length} user(s) on YPF\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of emails) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, email: true, platformUserId: true },
    });

    if (!user) {
      console.log(`  ⚠ ${email}: no active user found — skip`);
      skipped++;
      continue;
    }
    if (user.platformUserId) {
      console.log(`  • ${email}: already linked (${user.platformUserId}) — skip`);
      skipped++;
      continue;
    }

    if (dry) {
      console.log(`  → ${email}: would create YPF user`);
      continue;
    }

    try {
      const result = await createPlatformUser(user.id);
      console.log(`  ✓ ${email}: created → ${result.platformUserId}`);
      created++;
    } catch (err) {
      console.log(`  ✗ ${email}: FAILED — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(
    `\n${dry ? 'would create' : 'created'} ${dry ? emails.length - skipped : created}` +
      `${dry ? '' : `, skipped ${skipped}, failed ${failed}`}`,
  );
};

main()
  .catch((err) => {
    console.error('backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
