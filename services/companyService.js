const { pool } = require("../db");
const logger = require("../logger");

exports.create = async ({ company_name }) => {
  try {
    const result = await pool.query(
      `INSERT INTO siggem.company (company_name)
       VALUES ($1)
       RETURNING company_id`,
      [company_name],
    );
    const id = result.rows[0].company_id;
    logger.info(`Company created in DB: ${company_name} (ID: ${id})`);
    return id;
  } catch (err) {
    logger.error("Error in companyService.create:", err);
    throw err;
  }
};

exports.getAll = async () => {
  try {
    const result = await pool.query("SELECT * FROM siggem.company");
    logger.info(`Fetched ${result.rowCount} companies from DB`);
    return result.rows;
  } catch (err) {
    logger.error("Error in companyService.getAll:", err);
    throw err;
  }
};

exports.getById = async (id) => {
  try {
    const result = await pool.query(
      "SELECT * FROM siggem.company WHERE company_id = $1",
      [id],
    );
    logger.info(`Fetched company by ID: ${id}`);
    return result.rows[0];
  } catch (err) {
    logger.error(`Error in companyService.getById (ID: ${id}):`, err);
    throw err;
  }
};

exports.update = async (id, { company_name }) => {
  try {
    await pool.query(
      `UPDATE siggem.company SET company_name = $1
       WHERE company_id = $2`,
      [company_name, id],
    );
    logger.info(`Company updated: ID ${id}, new name: ${company_name}`);
  } catch (err) {
    logger.error(`Error in companyService.update (ID: ${id}):`, err);
    throw err;
  }
};

exports.remove = async (id) => {
  try {
    await pool.query("DELETE FROM siggem.company WHERE company_id = $1", [id]);
    logger.info(`Company deleted: ID ${id}`);
  } catch (err) {
    logger.error(`Error in companyService.remove (ID: ${id}):`, err);
    throw err;
  }
};
