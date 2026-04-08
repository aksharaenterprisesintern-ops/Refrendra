const { PrismaClient } = require('./packages/db/client/index.js');
const url = 'mongodb://mongo:dmnyulXufooDLIQerxkyxFcJTbnCjNBP@crossover.proxy.rlwy.net:55167/refhire?authSource=admin&replicaSet=rs0';
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function run() {
  try {
    const user = await prisma.user.create({
      data: {
        email: 'test_rep10@demo.com',
        name: 'Test',
        phone: '1234567810',
        passwordHash: 'hash',
        isVerified: false,
        employeeId: 'EMP-1810',
        role: 'CLUB_HEADER'
      }
    });
    console.log('Success:', user);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
