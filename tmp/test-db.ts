import { PrismaClient } from '@refhire/db';

const prisma = new PrismaClient();

async function test() {
  console.log('Testing connection to:', process.env.DATABASE_URL);
  try {
    const user = await prisma.user.findFirst();
    console.log('Successfully connected to MongoDB!');
    console.log('Sample user:', user ? user.email : 'None found');
    
    // Non-transactional create test
    try {
        const testEmail = `test-${Date.now()}@example.com`;
        const newUser = await prisma.user.create({
            data: {
                email: testEmail,
                name: 'Test User',
                phone: '1234567890',
                employeeId: `TEST-${Date.now()}`
            }
        });
        console.log('✅ Single-row create worked! (No replica set needed for simple create)');
        await prisma.user.delete({ where: { id: newUser.id } });
        console.log('✅ Cleaned up test user.');
    } catch (e) {
        console.error('❌ Simple create failed:', e.code, e.message);
    }

    // Upsert test (usually uses transactions)
    try {
        await prisma.user.upsert({
            where: { email: 'test-upsert@example.com' },
            create: { email: 'test-upsert@example.com', name: 'Upsert', phone: '1', employeeId: 'U1' },
            update: { name: 'Updated Upsert' }
        });
        console.log('✅ Transactional upsert worked! (Replica set active)');
    } catch (e) {
        if (e.code === 'P2031') {
            console.warn('⚠️ Replica set is NOT active. UPSERT and multi-row operations will fail.');
        } else {
            console.error('❌ Upsert failed for other reason:', e.code, e.message);
        }
    }

  } catch (error) {
    console.error('❌ Final Connection error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
