require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const session = require("express-session");
const cron = require("node-cron");
const {
  generateAndEmailDailyReports,
} = require("./controllers/batchPDFController");
const logger = require("./logger");
const { createClient } = require("redis");
const config = require("./config");
const redisClient = createClient({ legacyMode: true });
redisClient.connect().catch(console.error);

const { keycloak, redisStore } = require("./keycloak");
//Förhindra CORS-fel
const allowedOrigins = [
  process.env.CORS_ORIGIN,        // e.g., https://siggem-git-main-mans-projects-72273ac5.vercel.app
  process.env.CORS_ORIGIN_LOCAL,  // e.g., http://localhost:3000
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: true, // <- needed if using cookies or auth
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

//Konfigurera Redis
app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 },
  }),
);

//Om keycloakskyddet är på så konfigurera token
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
    logger.info("kauth");
    if (req.kauth && req.kauth.grant && req.kauth.grant.access_token) {
      console.log("working");
      req.user = req.kauth.grant.access_token.content;
    }
    next();
  });
}

//Gör mailutskick vi den utsatta tiden
/*function convertTimeToCronFormat(timeStr) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
  if (!match) {
    logger.warn(`Invalid REPORT_TIME format: '${timeStr}', expected HH:MM`);
    return null;
  }

  let [, hour, minute] = match;
  hour = parseInt(hour, 10);
  minute = parseInt(minute, 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    logger.warn(`Invalid time values in REPORT_TIME: '${timeStr}'`);
    return null;
  }

  return `${minute} ${hour} * * *`;
}

const timeInput = process.env.REPORT_TIME || "00:00";
const cronTime = convertTimeToCronFormat(timeInput) || "0 0 * * *";

cron.schedule(cronTime, async () => {
  logger.info("Running daily report at midnight");
  try {
    await generateAndEmailDailyReports();
  } catch (err) {
    logger.info("Failed to generate or send reports:", err);
  }
});*/

app.use(express.json());

app.use("/uploads", express.static("uploads"));

const receiptRoutes = require("./routes/receipt");
const uploadRoutes = require("./routes/upload");
const userRoutes = require("./routes/user");
const costCenterRoutes = require("./routes/costCenter");
const companyRoutes = require("./routes/company");
const healthRoutes = require("./routes/health");

app.use("/health", healthRoutes);
app.use("/receipt", receiptRoutes);
app.use("/upload", uploadRoutes);
app.use("/cost-center", costCenterRoutes);
app.use("/company", companyRoutes);
app.use("/user", userRoutes);

app.get("/", (req, res) => {
  res.send("Sigge API is running");
});

module.exports = app;
