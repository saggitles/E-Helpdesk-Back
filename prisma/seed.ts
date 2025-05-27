import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed roles
  const rolesToSeed = ['Admin', 'User', 'Guest'];

  for (const roleName of rolesToSeed) {
    await prisma.userRole.create({
      data: {
        role_name: roleName,
      },
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Error in seeding script:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });