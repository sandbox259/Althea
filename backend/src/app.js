// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authroutes = require("./routes/auth.routes");
const errorHandler = require("./middleware/errorHandler");
const clinicRoutes = require("./routes/clinic.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

//Routes
app.use("/api/auth", authroutes);
app.use("/api/clinics", clinicRoutes);

// Global error handler
app.use(errorHandler);

// temporary test route
app.get("/", (req, res) => {
  res.json({ status: "API is running..." });
});

module.exports = app;
