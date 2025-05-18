const bcrypt = require('bcrypt');

const hashPassword = async (password) => {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  return hash;
};

module.exports = { hashPassword };