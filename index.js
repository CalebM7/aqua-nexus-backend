const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const multer = require("multer");

dotenv.config();

const { initializeDatabase } = require("./src/database/config");
const { testDB } = require("./src/controllers/test-db");
const { authRouter } = require("./src/router/authRouter");
const { providerRouter } = require("./src/router/providerRouter");
const { projectRouter } = require("./src/router/projectRouter");
const { bidRouter } = require("./src/router/bidRouter");
const { reviewRouter } = require("./src/router/reviewRouter");
const { messageRouter } = require("./src/router/messageRouter");
const { notificationRouter } = require("./src/router/notificationRouter"); // Add this

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));
app.use("/images", express.static(path.join(__dirname, "public/images")));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.get("/", (req, res) => {
  res.send("AquaNexus Backend is Running 🚀");
});
app.get("/api/test-db", testDB);
app.use("/auth", authRouter);
app.use("/providers", providerRouter);
app.use("/projects", projectRouter);
app.use("/bids", bidRouter);
app.use("/reviews", reviewRouter);
app.use("/messages", messageRouter);
app.use("/notifications", notificationRouter); // Add this

// Catch-all for unhandled routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(
    `Error [${new Date().toISOString()}] ${req.method} ${req.url}:`,
    err.message
  );
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "File upload error: " + err.message });
  }
  if (err.message.includes("Only JPEG/PNG images are allowed")) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  initializeDatabase();
});