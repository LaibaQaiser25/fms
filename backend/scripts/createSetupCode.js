// Prints a one-time setup code for registering the main factory PC, without
// the dashboard (e.g. rebuilding the online server, T2.8). On the VPS:
//   sg docker -c "docker compose exec backend node scripts/createSetupCode.js"
require('dotenv').config();
const { createSetupCode } = require('../services/syncWriter');

createSetupCode()
  .then(({ code, expiresAt }) => {
    console.log(`Setup code: ${code}`);
    console.log(`Valid once, until ${expiresAt.toISOString()}. Any older unused code no longer works.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Could not create a setup code: ${err.message}`);
    process.exit(1);
  });
