const express = require("express");
const session = require("express-session");
const Cors = require("cors");
const { keycloak, redisStore } = require("./keycloak");

const app = express();

// Allowed origins
const allowedOrigins = [
  "https://siggem-git-main-mans-projects-72273ac5.vercel.app",
  "http://localhost:3000"
];

// CORS middleware
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

  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // preflight request
  }

  next();
});

// Session
app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// Keycloak
if (!process.env.DISABLE_KEYCLOAK_PROTECTION) {
  app.use(keycloak.middleware());

  const openPaths = new Set(["/health", "/user/reset-password"]);
  app.use((req, res, next) => {
    if (openPaths.has(req.path)) return next();
    return req.method === "OPTIONS" ? res.sendStatus(204) : keycloak.protect()(req, res, next);
  });
}

// Routes...
app.use(express.json());

module.exports = app;
