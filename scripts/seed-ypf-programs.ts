// =============================================================================
// YPF Program Linker
// =============================================================================
// Links every local `AccountType` to its matching YPF `Program` by setting
// `AccountType.ypfProgramId`. This is the seed that makes account-discovery and
// provisioning work: a discovered YPF account carries a `programId`, and we look
// up `AccountType WHERE ypfProgramId = programId` to know which DF product it is.
//
// YPF owns the program catalog (programs are created on the YPF side, named like
// "50k- Advanced Evaluation"), so this script does NOT create programs — it maps
// our AccountTypes onto the existing ones by plan + size, pointing each at its
// ENTRY (evaluation) program. Idempotent and read-only against YPF.
//
//   DF plan STANDARD → YPF "Standard"
//   DF plan ADVANCED → YPF "Advanced"
//   DF plan DYNASTY  → YPF "Builder"
//
// Run with:   tsx scripts/seed-ypf-programs.ts
//
// NOTE: accounts created directly on a FUNDED program (e.g. instant funding)
// won't match an AccountType linked to its evaluation program. Discovery resolves
// that by walking the program chain (funded → its evaluation predecessor).
// =============================================================================

import { PrismaClient } from '@prisma/client';
import { YPFClient } from '../src/providers/ypf/ypf.client.js';
import { logger } from '../src/utils/logger.js';

interface YPFProgram {
  id: string;
  name: string;
  nextProgramId?: string;
}

const prisma = new PrismaClient();
const client = new YPFClient();

// DF AccountType plan token → YPF program plan word.
const PLAN_WORD: Record<string, string> = {
  STANDARD: 'standard',
  ADVANCED: 'advanced',
  DYNASTY: 'builder',
};

// "50k- Advanced Evaluation" → { size: 50, plan: 'advanced', isEval, isFunded, isTesting }
const parseProgram = (
  name: string,
): {
  size: number | null;
  plan: string | null;
  isEval: boolean;
  isFunded: boolean;
  isTesting: boolean;
} => {
  const lower = name.toLowerCase();
  const sizeMatch = lower.match(/^(\d+)\s*k/);
  return {
    size: sizeMatch ? Number(sizeMatch[1]) : null,
    plan: ['standard', 'advanced', 'builder'].find((p) => lower.includes(p)) ?? null,
    isEval: lower.includes('evaluation'),
    isFunded: lower.includes('funded'),
    isTesting: lower.includes('do not use') || lower.includes('testing'),
  };
};

// "ADVANCED_50K" → { plan: 'ADVANCED', size: 50 }
const parseAccountType = (
  name: string,
): { plan: string | null; size: number | null } => {
  const [plan, sizeToken] = name.split('_');
  const size = sizeToken ? Number(sizeToken.replace(/k/i, '')) : NaN;
  return { plan: plan ?? null, size: Number.isFinite(size) ? size : null };
};

const main = async (): Promise<void> => {
  logger.info('YPF program link: starting');

  const programs = await client.get<YPFProgram[]>('/programs');
  const parsed = programs.map((p) => ({ ...p, ...parseProgram(p.name) }));

  const accountTypes = await prisma.accountType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (accountTypes.length === 0) {
    logger.warn('No active AccountType rows — run npm run db:seed first');
    return;
  }

  // Resolve all matches first; ypfProgramId is @unique, so we apply them in one
  // transaction that clears stale links before re-assigning — otherwise a stale
  // value colliding with another type's correct program aborts the run.
  const updates: { id: string; name: string; programId: string; program: string }[] = [];
  let missing = 0;

  for (const at of accountTypes) {
    const { plan, size } = parseAccountType(at.name);
    const planWord = plan ? PLAN_WORD[plan] : undefined;
    if (!planWord || size === null) {
      logger.warn({ accountType: at.name }, 'Cannot parse plan/size — skipping');
      missing++;
      continue;
    }

    // Match the evaluation (entry) program for this plan + size.
    const match = parsed.find(
      (p) =>
        p.plan === planWord &&
        p.size === size &&
        p.isEval &&
        !p.isFunded &&
        !p.isTesting,
    );
    if (!match) {
      logger.warn(
        { accountType: at.name, planWord, size },
        'No matching YPF evaluation program found',
      );
      missing++;
      continue;
    }

    updates.push({ id: at.id, name: at.name, programId: match.id, program: match.name });
  }

  await prisma.$transaction([
    prisma.accountType.updateMany({
      where: { isActive: true },
      data: { ypfProgramId: null },
    }),
    ...updates.map((u) =>
      prisma.accountType.update({
        where: { id: u.id },
        data: { ypfProgramId: u.programId },
      }),
    ),
  ]);

  for (const u of updates) {
    logger.info(
      { accountType: u.name, program: u.program, ypfProgramId: u.programId },
      'AccountType linked to YPF program',
    );
  }

  logger.info({ linked: updates.length, missing }, 'YPF program link: complete');
};

main()
  .catch((err) => {
    logger.error({ err }, 'YPF program link failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
