import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed roles
  const rolesToSeed = ['Admin', 'User', 'Guest'];

  for (const RoleName of rolesToSeed) {
    await prisma.userRole.create({
      data: {
        RoleName,
      },
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });