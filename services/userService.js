const axios = require("axios");
const { pool } = require("../db");
const { getAdminToken } = require("../controllers/authController");
const logger = require("../logger");
const url = process.env.KEYCLOAK_URL;

const createKeycloakUser = async (userData) => {
  try {
    const token = await getAdminToken();

    const res = await axios.post(
      `${url}/admin/realms/${process.env.KEYCLOAK_REALM}/users`,
      userData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const locationHeader = res.headers.location;
    const userId = locationHeader?.split("/").pop();

    logger.info(`Keycloak user created with ID ${userId}`);
    return userId;
  } catch (err) {
    logger.error(
      "Failed to create Keycloak user:",
      err.response?.data || err.message,
    );
    throw err;
  }
};

exports.create = async ({
  first_name,
  surname,
  email,
  company_id,
  cost_center_id,
  password,
  isAdmin,
}) => {
  const userData = {
    username: first_name,
    email,
    emailVerified: true,
    enabled: true,
    firstName: first_name,
    lastName: surname,
    credentials: [
      {
        type: "password",
        value: password,
        temporary: false,
      },
    ],
  };

  if (isAdmin) {
    userData.realmRoles = ["admin"]; //Lägg till admin
  }

  const user_id = await createKeycloakUser(userData);

  const result = await pool.query(
    `INSERT INTO siggem.user (user_id, first_name, surname, email, company_id, cost_center_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING user_id`,
    [user_id, first_name, surname, email, company_id, cost_center_id],
  );

  logger.info(`User inserted into DB with ID ${user_id}`);
  return user_id;
};

exports.getAll = async () => {
  const result = await pool.query("SELECT * FROM siggem.user");
  logger.info(`Fetched ${result.rowCount} users from DB`);
  return result.rows;
};

exports.getById = async (id) => {
  const result = await pool.query(
    "SELECT * FROM siggem.user WHERE user_id = $1",
    [id],
  );
  logger.info(`Fetched user by ID ${id}`);
  return result.rows[0];
};

exports.update = async (
  id,
  { first_name, surname, email, company_id, cost_center_id, password, isAdmin },
) => {
  try {
    const token = await getAdminToken();

    const body = {
      firstName: first_name,
      lastName: surname,
      email,
      emailVerified: true,
      enabled: true,
      isAdmin: isAdmin,
      credentials: [
        {
          type: "password",
          value: password,
          temporary: false,
        },
      ],
    };

    await axios.put(
      `${url}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${id}`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    await pool.query(
      `UPDATE siggem.user
       SET first_name=$1, surname=$2, email=$3, company_id=$4, cost_center_id=$5
       WHERE user_id=$6`,
      [first_name, surname, email, company_id, cost_center_id, id],
    );

    logger.info(`User ${id} updated in both Keycloak and DB`);
  } catch (err) {
    logger.error(
      `Error updating user ${id}:`,
      err.response?.data || err.message,
    );
    throw err;
  }
};

exports.remove = async (id) => {
  try {
    const token = await getAdminToken();

    await axios.delete(
      `${url}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    await pool.query("DELETE FROM siggem.user WHERE user_id = $1", [id]);

    logger.info(`User ${id} deleted from Keycloak and DB`);
    return true;
  } catch (err) {
    logger.error(
      `Failed to delete user ${id}:`,
      err.response?.data || err.message,
    );
    return false;
  }
};
