const axios = require("axios");
const logger = require("../logger");
const url = process.env.KEYCLOAK_URL;
const secret = process.env.CLIENT_SECRET;
const id = process.env.CLIENT_ID;
const realm = process.env.KEYCLOAK_REALM;
const redirectUri = process.env.REDIRECT_URI;
const p = (e) => ({
  status: e.response?.status,
  data: e.response?.data,
  url: e.config?.url,
  params: e.config?.params,
});

exports.resetPassword = async (req, res) => {
  const email = String(req.body.usernameOrEmail || "").trim();

  //Granska email formatet
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isEmail) {
    //Skicka samma meddleande oavsett om mailen finns eller inte som en säkerhetsåtgärd
    return res.status(200).json({
      message: "If the account exists, a reset email has been sent.",
    });
  }

  try {
    // Admin token
    const tokenRes = await axios.post(
      `${url}/realms/${realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: "client_credentials",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const adminToken = tokenRes.data.access_token;

    // Matcha mailen exakt
    const userRes = await axios.get(`${url}/admin/realms/${realm}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: { email, exact: true, max: 2 },
    });

    const user = (userRes.data || [])[0];
    if (!user) {
      return res.status(200).json({
        message: "If the account exists, a reset email has been sent.",
      });
    }

    if (!redirectUri) {
      return res
        .status(500)
        .json({ error: "Server misconfig: REDIRECT_URI not set" });
    }

    await axios.put(
      `${url}/admin/realms/${realm}/users/${user.id}/execute-actions-email`,
      ["UPDATE_PASSWORD"],
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        params: {
          client_id: process.env.FRONTEND_PUBLIC_CLIENT_ID || "siggem-front",
          redirect_uri: redirectUri,
        },
      },
    );

    return res.json({
      message: "If the account exists, a reset email has been sent.",
    });
  } catch (err) {
    logger.error("resetPassword error:", p(err));
    return res.status(500).json({ error: "Failed to send reset email" });
  }
};
exports.getAdminToken = async () => {
  const res = await axios.post(
    `${url}/realms/${realm}/protocol/openid-connect/token`,
    new URLSearchParams({
      client_id: id,
      grant_type: "client_credentials",
      client_secret: secret,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  return res.data.access_token;
};
