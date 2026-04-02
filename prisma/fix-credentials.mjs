/**
 * Fix credentials for imported Volumetrica test users.
 * Sets password to: TestPassword123!
 *
 * Run:  node prisma/fix-credentials.mjs
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'TestPassword123!';
const BCRYPT_ROUNDS = 12;

async function main() {
  const hash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
  console.log('Generated hash:', hash);

  const users = await prisma.user.findMany({
    where: { platformUserId: { not: null } },
    include: { credentials: true },
  });

  for (const user of users) {
    if (!user.credentials) {
      console.log(`SKIP ${user.email} — no credential record`);
      continue;
    }

    await prisma.userCredential.update({
      where: { id: user.credentials.id },
      data: { passwordHash: hash },
    });

    console.log(`Updated credentials for ${user.email}`);
  }

  console.log('\nDone! All platform-linked users now have password: ' + TEST_PASSWORD);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
