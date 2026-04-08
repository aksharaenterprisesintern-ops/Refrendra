const { PrismaClient } = require('./packages/db/client/index.js');
const dotenv = require('dotenv');
dotenv.config();

const prisma = new PrismaClient();

async function test() {
  console.log('Testing connection to:', process.env.DATABASE_URL);
  try {
    const user = await prisma.user.findFirst();
    console.log('✅ Successfully connected to MongoDB!');
    console.log('Sample user:', user ? user.email : 'None found');
    
    const testEmail = `test-${Date.now()}@example.com`;
    try {
        const newUser = await prisma.user.create({
            data: {
                email: testEmail,
                name: 'Test User',
                phone: '1234567890',
                employeeId: `TEST-${Date.now()}`
            }
        });
        console.log('✅ Single-row create worked!');
        await prisma.user.delete({ where: { id: newUser.id } });
        console.log('✅ Cleaned up test user.');
    } catch (e) {
        console.error('❌ Simple create failed:', e.code, e.message);
    }

  } catch (error) {
    console.error('❌ Connection error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
