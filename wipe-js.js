const { PrismaClient } = require('./packages/db/client/index.js');
const dotenv = require('dotenv');
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️ Wiping database using raw commands (bypassing transactions)...');
  try {
    const collections = ['StatusLog', 'Referral', 'OtpVerification', 'User'];
    for (const collection of collections) {
      try {
        const result = await prisma.$runCommandRaw({
          delete: collection,
          deletes: [{ q: {}, limit: 0 }]
        });
        console.log(`✅ Cleared ${collection}:`, result);
      } catch (e) {
        console.error(`⚠️ Failed to clear ${collection}:`, e.message);
      }
    }
    console.log('✅ Database wiped successfully.');
  } catch (e) {
    console.error('❌ Wipe process failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
