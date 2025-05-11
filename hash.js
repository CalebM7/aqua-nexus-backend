const bcrypt = require('bcrypt');

async function hashPassword(password) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log(`Password: ${password}, Hash: ${hash}`);
}

hashPassword('password123'); // For provider1
hashPassword('password456'); // For provider2