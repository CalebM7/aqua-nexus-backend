// test-hash.js
const { hashPassword } = require('./utils/hash');

(async () => {
  const hash = await hashPassword('password123');
  console.log('Hashed password:', hash);
})();