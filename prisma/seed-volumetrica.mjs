/**
 * One-time seed script — imports Volumetrica test data into the local DB.
 *
 * Run:  node prisma/seed-volumetrica.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Volumetrica test data (from /api/v2/Propsite/User/List) ─────────────────

const PLATFORM_USERS = [
  {
    platformUserId: '59db7773-7bdf-4f2c-9cc7-2b53fc22fe17',
    email: 'leo+dynasty@quanttechnology.com',
    firstName: 'Leo',
    lastName: 'CRM',
  },
  {
    platformUserId: '79d3599d-9cb9-4d8b-b003-54b3583b0292',
    email: 'brockadams@dynastyfuturesdyn.com',
    firstName: 'Brock',
    lastName: 'Adams',
  },
  {
    platformUserId: '77f87700-d44c-425d-aac1-319b48335845',
    email: 'zacharyperez@dynastyfuturesdyn.com',
    firstName: 'Zachary',
    lastName: 'Perez',
  },
  {
    platformUserId: '295ae532-3855-46e2-bd86-6c944b899e39',
    email: 'cvadams4@gmail.com',
    firstName: 'Adams',
    lastName: 'CV',
  },
  {
    platformUserId: '92323d0c-16ef-4df9-ad81-473fdc051b86',
    email: 'cliffadams@dynastyfuturesdyn.com',
    firstName: 'Cliff',
    lastName: 'Adams',
  },
];

const PLATFORM_ACCOUNTS = [
  // Leo — 3 accounts
  { accountId: 'd56deea7-bf06-4e00-a634-25a39d48a715', header: 'DYN08792', ownerPlatformUserId: '59db7773-7bdf-4f2c-9cc7-2b53fc22fe17', startBalance: 50000 },
  { accountId: 'd6c727ce-ac82-464b-aabc-5a8c5fc41d93', header: 'DYN08793', ownerPlatformUserId: '59db7773-7bdf-4f2c-9cc7-2b53fc22fe17', startBalance: 50000 },
  { accountId: 'dcf47600-d6e6-4102-b4ba-cd884b0bdfc5', header: 'DYN08794', ownerPlatformUserId: '59db7773-7bdf-4f2c-9cc7-2b53fc22fe17', startBalance: 50000 },
  // Brock — 2 accounts
  { accountId: '2fbede61-e6e2-45df-932d-c74566d44bde', header: 'DYN08790', ownerPlatformUserId: '79d3599d-9cb9-4d8b-b003-54b3583b0292', startBalance: 50000 },
  { accountId: 'a6fc7b19-8c8c-437c-9411-c28bac624095', header: 'DYN08791', ownerPlatformUserId: '79d3599d-9cb9-4d8b-b003-54b3583b0292', startBalance: 50000 },
  // Zachary — 2 accounts
  { accountId: 'd4076b1f-987d-4329-8eb5-4e4954a7ac1e', header: 'DYN08788', ownerPlatformUserId: '77f87700-d44c-425d-aac1-319b48335845', startBalance: 50000 },
  { accountId: '647b8b28-3f53-4152-95e7-8b4bb5af7e4e', header: 'DYN08789', ownerPlatformUserId: '77f87700-d44c-425d-aac1-319b48335845', startBalance: 50000 },
  // Adams CV — 2 accounts
  { accountId: '0b6e5147-366d-44c8-8140-7e74066a59ae', header: 'DYN08786', ownerPlatformUserId: '295ae532-3855-46e2-bd86-6c944b899e39', startBalance: 50000 },
  { accountId: '18df7c54-652a-46eb-8c59-bbb5b5b820f4', header: 'DYN08787', ownerPlatformUserId: '295ae532-3855-46e2-bd86-6c944b899e39', startBalance: 50000 },
  // Cliff — 1 account
  { accountId: '3787c385-5caa-4128-bda7-99a5542646b7', header: 'DYN08785', ownerPlatformUserId: '92323d0c-16ef-4df9-ad81-473fdc051b86', startBalance: 50000 },
];

async function main() {
  console.log('=== Volumetrica Test Data Import ===\n');

  // 1. Ensure a 50K AccountType exists
  let accountType = await prisma.accountType.findUnique({ where: { name: '50K' } });
  if (!accountType) {
    accountType = await prisma.accountType.create({
      data: {
        name: '50K',
        displayName: '50K Evaluation',
        description: '$50,000 futures evaluation account',
        accountSize: 50000,
        price: 299,
        resetPrice: 99,
        profitSplit: 80,
        minPayoutAmount: 100,
        payoutFrequency: 'bi-weekly',
        isActive: true,
        sortOrder: 1,
      },
    });
    console.log(`  Created AccountType: ${accountType.name} (${accountType.id})`);
  } else {
    console.log(`  AccountType 50K already exists (${accountType.id})`);
  }

  // 2. Upsert users — match by email, link platformUserId
  const platformToLocal = new Map(); // platformUserId → local user id

  for (const pu of PLATFORM_USERS) {
    let user = await prisma.user.findUnique({ where: { email: pu.email } });

    if (user) {
      if (!user.platformUserId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { platformUserId: pu.platformUserId },
        });
        console.log(`  Linked existing user ${pu.email} → platform ${pu.platformUserId}`);
      } else {
        console.log(`  User ${pu.email} already linked (${user.platformUserId})`);
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: pu.email,
          firstName: pu.firstName,
          lastName: pu.lastName,
          role: 'TRADER',
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          platformUserId: pu.platformUserId,
        },
      });
      console.log(`  Created user ${pu.email} (${user.id}) → platform ${pu.platformUserId}`);
    }

    platformToLocal.set(pu.platformUserId, user.id);
  }

  // 3. Upsert trading accounts
  for (const pa of PLATFORM_ACCOUNTS) {
    const localUserId = platformToLocal.get(pa.ownerPlatformUserId);
    if (!localUserId) {
      console.warn(`  SKIP account ${pa.header} — no local user for platform ${pa.ownerPlatformUserId}`);
      continue;
    }

    const existing = await prisma.account.findUnique({
      where: { yourPropFirmId: pa.accountId },
    });

    if (existing) {
      console.log(`  Account ${pa.header} already exists (${existing.id})`);
      continue;
    }

    const account = await prisma.account.create({
      data: {
        userId: localUserId,
        accountTypeId: accountType.id,
        yourPropFirmId: pa.accountId,
        status: 'EVALUATION',
        startingBalance: pa.startBalance,
        currentBalance: pa.startBalance,
        highWaterMark: pa.startBalance,
        activatedAt: new Date(),
      },
    });

    console.log(`  Created account ${pa.header} (${account.id}) for user ${localUserId}`);
  }

  // 4. Summary
  const userCount = await prisma.user.count({ where: { deletedAt: null } });
  const accountCount = await prisma.account.count({ where: { deletedAt: null } });
  console.log(`\n=== Done! ${userCount} users, ${accountCount} accounts in local DB ===`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
