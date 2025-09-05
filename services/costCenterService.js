const { pool } = require("../db");
const logger = require("../logger");

exports.create = async ({ cost_center_number, cost_center_name }) => {
  try {
    const result = await pool.query(
      `INSERT INTO siggem.cost_center (cost_center_number, cost_center_name)
       VALUES ($1, $2)
       RETURNING cost_center_id`,
      [cost_center_number, cost_center_name],
    );
    const id = result.rows[0].cost_center_id;
    logger.info(
      `Cost center created: ID ${id}, Number: ${cost_center_number}, Name: ${cost_center_name}`,
    );
    return id;
  } catch (err) {
    logger.error("Error in costCenterService.create:", err);
    throw err;
  }
};

exports.getAll = async () => {
  try {
    const result = await pool.query("SELECT * FROM siggem.cost_center");
    logger.info(`Fetched ${result.rowCount} cost centers`);
    return result.rows;
  } catch (err) {
    logger.error("Error in costCenterService.getAll:", err);
    throw err;
  }
};

exports.getById = async (id) => {
  try {
    const result = await pool.query(
      "SELECT * FROM siggem.cost_center WHERE cost_center_id = $1",
      [id],
    );
    logger.info(`Fetched cost center by ID: ${id}`);
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in costCenterService.getById (ID: ${id}):`, err);
    throw err;
  }
};

exports.update = async (id, { cost_center_number, cost_center_name }) => {
  try {
    await pool.query(
      `UPDATE siggem.cost_center
       SET cost_center_number = $1, cost_center_name = $2
       WHERE cost_center_id = $3`,
      [cost_center_number, cost_center_name, id],
    );
    logger.info(
      `Cost center updated: ID ${id}, Number: ${cost_center_number}, Name: ${cost_center_name}`,
    );
  } catch (err) {
    logger.error(`Error in costCenterService.update (ID: ${id}):`, err);
    throw err;
  }
};

exports.remove = async (id) => {
  try {
    await pool.query(
      "DELETE FROM siggem.cost_center WHERE cost_center_id = $1",
      [id],
    );
    logger.info(`Cost center deleted: ID ${id}`);
  } catch (err) {
    logger.error(`Error in costCenterService.remove (ID: ${id}):`, err);
    throw err;
  }
};
