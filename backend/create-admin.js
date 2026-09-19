const bcrypt = require("bcryptjs");

(async () => {
  const password = "Rgh@951852";
  const hash = await bcrypt.hash(password, 10);
  console.log("BCrypt Hash:");
  console.log(hash);
})();
