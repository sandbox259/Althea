// src/server.js
const { port } = require("./config");
const app = require("./app");

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
