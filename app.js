require("dotenv").config();
const express = require("express");
const session = require("express-session");
const serverless = require("serverless-http");
const { createClient } = require("redis");
const { keycloak, redisStore } = require("./keycloak");
const logger = require("./logger");
const config = require("./config");

// Initialize Express
const app = express();

// -------------------- Redis --------------------
const redisClient = createClient({ legacyMode: true });
redisClient.connect().catch(console.error);

// -------------------- CORS --------------------
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://siggem-git-main-mans-projects-72273ac5.vercel.app",
    "http://localhost:3000"
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header("Access-Control-Allow-Credentials", "true");
  }

  // ✅ Preflight request handling
  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});
// -------------------- Sessions --------------------
app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

// -------------------- Keycloak --------------------
if (!config.DISABLE_KEYCLOAK_PROTECTION) {
  app.use(keycloak.middleware());

  const openPaths = new Set(["/health", "/user/reset-password"]);

  app.use((req, res, next) => {
    if (openPaths.has(req.path)) return next();
    // ✅ Skip OPTIONS requests to avoid redirect
    return req.method === "OPTIONS"
      ? res.sendStatus(204)
      : keycloak.protect()(req, res, next);
  });
}

// -------------------- Middleware --------------------
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// -------------------- Routes --------------------
app.use("/health", require("./routes/health"));
app.use("/receipt", require("./routes/receipt"));
app.use("/upload", require("./routes/upload"));
app.use("/cost-center", require("./routes/costCenter"));
app.use("/company", require("./routes/company"));
app.use("/user", require("./routes/user"));

app.get("/", (req, res) => {
  res.send("Sigge API is running");
});

// -------------------- Export --------------------
// For Vercel serverless deployment

module.exports = serverless(app);