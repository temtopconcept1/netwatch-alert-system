// server.js — Entry point for the Cloud-Based Network Alert Notification System
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const apiRoutes = require("./src/routes");
const { startMonitoring } = require("./src/monitor");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", apiRoutes);

app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Cloud-Based Network Alert Notification System listening on port ${PORT}`);
  startMonitoring();
});
