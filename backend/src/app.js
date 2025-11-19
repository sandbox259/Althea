// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// temporary test route
app.get("/", (req, res) => {
  res.json({ status: "API is running..." });
});

module.exports = app;
