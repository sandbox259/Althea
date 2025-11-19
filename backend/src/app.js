// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authroutes = require("./routes/auth.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api/auth", authroutes);

// temporary test route
app.get("/", (req, res) => {
  res.json({ status: "API is running..." });
});

module.exports = app;
