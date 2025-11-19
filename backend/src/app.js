// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const errorHandler = require("./middleware/errorHandler");
const clinicRoutes = require("./routes/clinic.routes");
const patientRoutes = require("./routes/patient.routes");
const scheduleRoutes = require("./routes/doctor-schedule.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

//Routes
app.use("/api/auth", authRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctor-schedule", scheduleRoutes);

// Global error handler
app.use(errorHandler);

// temporary test route
app.get("/", (req, res) => {
  res.json({ status: "API is running..." });
});

module.exports = app;
