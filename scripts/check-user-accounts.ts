// One-shot: list a YPF user's accounts (read-only). Used to verify that
// register-only user creation did NOT provision an account.
//   tsx scripts/check-user-accounts.ts <platformUserId>
import { getTradingPlatformProvider } from '../src/providers/index.js';

const platformUserId = process.argv[2];
if (!platformUserId) {
  console.error('usage: tsx scripts/check-user-accounts.ts <platformUserId>');
  process.exit(1);
}

const provider = getTradingPlatformProvider();

async function main(): Promise<void> {
  const accounts = await provider.listUserAccounts(platformUserId as string);
  console.log(`platformUserId=${platformUserId} -> ${accounts.length} account(s)`);
  for (const a of accounts) {
    console.log(
      `  - id=${a.platformAccountId} program=${a.programId} status=${a.status} balance=${a.balance}`,
    );
  }
  console.log(
    accounts.length === 0
      ? 'SAFE: register-only created NO account'
      : 'WARNING: an account WAS provisioned',
  );
}

main()
  .catch((e) => console.error('error:', (e as Error).message))
  .finally(() => process.exit(0));
