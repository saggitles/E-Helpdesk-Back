// Minimal mock Prisma client for Azure deployment
// This bypasses all Prisma client generation issues

const mockPrisma = {
  $connect: async () => {
    console.log('Mock Prisma: Connected');
    return Promise.resolve();
  },
  
  $disconnect: async () => {
    console.log('Mock Prisma: Disconnected');
    return Promise.resolve();
  },
  
  $queryRaw: async (query) => {
    console.log('Mock Prisma: Query executed:', query);
    return [{ current_time: new Date() }];
  },
  
  ticket: {
    findMany: async () => {
      console.log('Mock Prisma: ticket.findMany called');
      return [];
    },
    findUnique: async () => {
      console.log('Mock Prisma: ticket.findUnique called');
      return null;
    },
    create: async (data) => {
      console.log('Mock Prisma: ticket.create called');
      return { id: 1, ...data.data };
    },
    update: async (data) => {
      console.log('Mock Prisma: ticket.update called');
      return { id: data.where.id, ...data.data };
    }
  },
  
  user: {
    findMany: async () => {
      console.log('Mock Prisma: user.findMany called');
      return [];
    }
  },
  
  comment: {
    findMany: async () => {
      console.log('Mock Prisma: comment.findMany called');
      return [];
    }
  },
  
  file: {
    findMany: async () => {
      console.log('Mock Prisma: file.findMany called');
      return [];
    },
    create: async (data) => {
      console.log('Mock Prisma: file.create called');
      return { id: 1, ...data.data };
    },
    findUnique: async () => {
      console.log('Mock Prisma: file.findUnique called');
      return null;
    },
    delete: async () => {
      console.log('Mock Prisma: file.delete called');
      return {};
    }
  }
};

module.exports = mockPrisma;