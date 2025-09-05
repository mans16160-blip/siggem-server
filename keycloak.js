const session = require("express-session");
const Keycloak = require("keycloak-connect");
const connectRedis = require("connect-redis");

const RedisStore = connectRedis(session);

const { createClient } = require("redis");

const redisClient = createClient({ legacyMode: true });
redisClient.connect().catch(console.error);

const redisStore = new RedisStore({ client: redisClient });

const keycloak = new Keycloak({ store: redisStore });

module.exports = { keycloak, redisStore };
