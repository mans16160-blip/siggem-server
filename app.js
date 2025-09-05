require("dotenv").config();
const express = require("express");
const session = require("express-session");
const Cors = require("cors");
const { createClient } = require("redis");
const { keycloak, redisStore } = require("./keycloak");
const config = require("./config");
const logger = require("./logger");

// Initialize Express
const app = express();

// Initialize Redis
const redisClient = createClient({ legacyMode: true });
redisClient.connect().catch(console.error);

// -------------------- CORS Setup --------------------
import Cors from 'cors';
import initMiddleware from '../../lib/init-middleware';

// Allowed origins
const allowedOrigins = [
  'https://siggem-git-main-mans-projects-72273ac5.vercel.app',
  'https://siggem-git-main-mans-projects-72273ac5.vercel.app/',
  'http://localhost:3000'
];

const cors = initMiddleware(
  Cors({
    origin: function(origin, callback) {
      if (!origin) return callback(null, true); // server-to-server requests
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

export default async function handler(req, res) {
  await cors(req, res); // Apply CORS

  res.status(200).json({ message: 'CORS works!' });
}

// -------------------- Session Setup --------------------
app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS in prod
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// -------------------- Keycloak Protection --------------------
if (!config.DISABLE_KEYCLOAK_PROTECTION) {
  logger.info("Keycloak protection enabled");
  app.use(keycloak.middleware());

  const openPaths = new Set(["/health", "/user/reset-password"]);

  const skipOptions = (mw) => (req, res, next) =>
    req.method === "OPTIONS" ? res.sendStatus(204) : mw(req, res, next);

  app.use((req, res, next) => {
    if (openPaths.has(req.path)) return next();
    return skipOptions(keycloak.protect())(req, res, next);
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

app.get("/", (req, res) => {
  res.send("Sigge API is running");
});

// Export for Vercel serverless deployment
module.exports = app;
