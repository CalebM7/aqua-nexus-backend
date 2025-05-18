const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const initializeDatabase = require("./db/init");
const authRoutes = require("./routes/auth");
const providerRoutes = require("./routes/providers");
const projectRoutes = require("./routes/projects");
const bidRoutes = require("./routes/bids");
const reviewRoutes = require("./routes/reviews");
const messageRoutes = require("./routes/messages");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL
      : "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));

// Middleware
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

app.get("/api/test-db", async (req, res) => {
  try {
    const pool = require("./db/pool");
    const result = await pool.query("SELECT NOW()");
    res.json({ message: "Database connected", time: result.rows[0].now });
  } catch (err) {
    console.error("Database query error:", err.message);
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.use("/auth", authRoutes);
app.use("/providers", providerRoutes);
app.use("/projects", projectRoutes);
app.use("/bids", bidRoutes);
app.use("/reviews", reviewRoutes);
app.use("/messages", messageRoutes);

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
