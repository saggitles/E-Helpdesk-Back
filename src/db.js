const { createFleetIQClient } = require('./config/database');

// Use the database factory function instead of hardcoded connection
const getClient = () => {
  return createFleetIQClient();
};

// Export a function that creates a new client each time
module.exports = {
  getClient,
  // For backward compatibility, create a global client
  pgClient: createFleetIQClient()
};
