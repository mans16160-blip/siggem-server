require("dotenv").config();
const express = require("express");
const session = require("express-session");
const { keycloak, redisStore } = require("./keycloak");
const logger = require("./logger");
const config = require("./config");

const app = express();

// -------------------- CORS Middleware --------------------
const allowedOrigins = [
  "https://siggem-git-main-mans-projects-72273ac5.vercel.app",
  "http://localhost:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Credentials", "true");
  }

  // ✅ Immediately respond to preflight
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
    cookie: { secure: process.env.NODE_ENV === "production", maxAge: 86400 * 1000 },
  })
);

// -------------------- Keycloak --------------------
if (!config.DISABLE_KEYCLOAK_PROTECTION) {
  app.use(keycloak.middleware());

  const openPaths = new Set(["/health", "/user/reset-password"]);

  app.use((req, res, next) => {
    if (openPaths.has(req.path)) return next();

    // ✅ Skip Keycloak for preflight requests
    return req.method === "OPTIONS"
      ? res.sendStatus(204)
      : keycloak.protect()(req, res, next);
  });

  app.use((req, res, next) => {
    if (req.kauth?.grant?.access_token) {
      req.user = req.kauth.grant.access_token.content;
    }
    next();
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

app.get("/", (req, res) => res.send("Sigge API is running"));

module.exports = app;
