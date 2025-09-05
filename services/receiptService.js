const { pool } = require("../db");
const logger = require("../logger");
const dayjs = require("dayjs");
const puppeteer = require("puppeteer");
const fs = require("fs");
exports.create = async ({
  creation_date,
  receipt_date,
  user_id,
  company_card,
  net,
  tax,
  image_links,
  description,
}) => {
  try {
    const result = await pool.query(
      `INSERT INTO siggem.receipt (creation_date, receipt_date, user_id, company_card, tax, net, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING receipt_id`,
      [
        creation_date,
        receipt_date,
        user_id,
        company_card,
        tax,
        net,
        description,
      ],
    );
    logger.info(`Created receipt with ID: ${result.rows[0].receipt_id}`);
    createImages(image_links, result.rows[0].receipt_id);
    return result.rows[0].receipt_id;
  } catch (err) {
    logger.error("Error creating receipt:", err);
    throw err;
  }
};

async function createImages(links, receipt_id) {
  logger.info(
    `Storing ${links.length} links in DB for receipt ${receipt_id}...`,
  );

  for (let i = 0; i < links.length; i++) {
    await pool.query(
      `INSERT INTO siggem.image_xref (receipt_id, link, page_number)
       VALUES ($1, $2, $3)`,
      [receipt_id, links[i], i + 1],
    );
    logger.info(`Stored link for page ${i + 1}: ${links[i]}`);
  }

  logger.info("All links stored successfully in correct order.");
}
exports.createRepresented = async (id, represented) => {
  try {
    const insertPromises = represented.map((item) =>
      pool.query(
        `INSERT INTO siggem.represented_xref (user_name, receipt_id)
         VALUES ($1, $2)`,
        [item, id],
      ),
    );
    await Promise.all(insertPromises);
    logger.info(
      `Created ${represented.length} represented_xref rows for receipt ${id}`,
    );
  } catch (err) {
    logger.error("Error creating represented_xref:", err);
    throw err;
  }
};

exports.createOther = async (id, other) => {
  try {
      pool.query(
        `INSERT INTO siggem.receipt_other_info (note, receipt_id)
         VALUES ($1, $2)`,
        [other, id],
    );
    logger.info(
      `Created 1 receipt_other_info row for receipt ${id}`,
    );
  } catch (err) {
    logger.error("Error creating receipt_other_info:", err);
    throw err;
  }
};

exports.createCompanyCharge = async (id, charged_companies) => {
  try {
    const insertPromises = charged_companies.map(async (companyId) => {
      return pool.query(
        `INSERT INTO siggem.company_charge_xref (company_id, receipt_id)
         VALUES ($1, $2)`,
        [companyId, id],
      );
    });

    await Promise.all(insertPromises);
    logger.info(
      `Created ${charged_companies.length} company_charge_xref rows for receipt ${id}`,
    );
  } catch (err) {
    logger.error("Error creating company_charge_xref:", err);
    throw err;
  }
};

exports.getAll = async () => {
  try {
    const result = await pool.query(`
  SELECT r.*,
         COALESCE(json_agg(i.link) FILTER (WHERE i.link IS NOT NULL), '[]') AS images
  FROM siggem.receipt r
  LEFT JOIN siggem.image_xref i
         ON r.receipt_id = i.receipt_id
  GROUP BY r.receipt_id ORDER BY r.receipt_id
      `);

    logger.info(`Fetched ${result.rows.length} receipts`);
    return result.rows;
  } catch (err) {
    logger.error("Error fetching receipts:", err);
    throw err;
  }
};

exports.getByUser = async (user_id) => {
  try {
    const result = await pool.query(
      `  SELECT r.*,
         COALESCE(json_agg(i.link) FILTER (WHERE i.link IS NOT NULL), '[]') AS images
  FROM siggem.receipt r 
  LEFT JOIN siggem.image_xref i
         ON r.receipt_id = i.receipt_id
		 WHERE r.user_id = $1
  GROUP BY r.receipt_id ORDER BY r.receipt_id
`,
      [user_id],
    );
    return result.rows;
  } catch (err) {
    logger.error("Error fetching receipts:", err);
    throw err;
  }
};

exports.getById = async (id) => {
  try {
    const result = await pool.query(
      `  SELECT r.*,
         COALESCE(json_agg(i.link) FILTER (WHERE i.link IS NOT NULL), '[]') AS images
  FROM siggem.receipt r 
  LEFT JOIN siggem.image_xref i
         ON r.receipt_id = i.receipt_id
		 WHERE r.receipt_id = $1
  GROUP BY r.receipt_id
`,
      [id],
    );
    if (result.rows.length === 0) {
      logger.warn(`Receipt with ID ${id} not found`);
    } else {
      logger.info(`Fetched receipt with ID ${id}`);
    }
    return result.rows[0];
  } catch (err) {
    logger.error(`Error fetching receipt ${id}:`, err);
    throw err;
  }
};
exports.generatePDF = async (id) => {
  try {
    logger.info(`PDF generation requested for receipt ID ${id} `);
    //Hämta data
    const receiptData = await pool.query(
      "SELECT * FROM siggem.receipt WHERE receipt_id = $1",
      [id],
    );
    const receipt = receiptData.rows[0];

    if (!receipt) {
      logger.warn(`Receipt not found for ID ${id}`);
    }

    receipt.total = receipt.net + receipt.tax;

    const [representedData, userData, chargedCompanyData, imageData] =
      await Promise.all([
        pool.query(
          "SELECT * FROM siggem.represented_xref WHERE receipt_id = $1",
          [id],
        ),
        pool.query("SELECT * FROM siggem.user WHERE user_id = $1", [
          receipt.user_id,
        ]),
        pool.query(
          "SELECT * FROM siggem.company_charge_xref WHERE receipt_id = $1",
          [id],
        ),
        pool.query("SELECT * FROM siggem.image_xref WHERE receipt_id = $1", [
          id,
        ]),
      ]);

    const user = userData.rows[0];

    const companyData = await pool.query(
      "SELECT * FROM siggem.company WHERE company_id = $1",
      [user.company_id],
    );
    const company = companyData.rows[0];
    receipt.company = company;

    const companyIds = chargedCompanyData.rows.map((item) => item.company_id);
    const other = await pool.query(
      "SELECT * FROM siggem.receipt_other_info WHERE receipt_id = $1",
      [id],
    );
   
    if(other.rows.length > 0){ 
      console.log(other.rows[0].note)
    receipt.other = other.rows[0].note
  }
    let chargedCompanies = [];
    if (companyIds.length > 0) {
      const chargedCompaniesData = await pool.query(
        `SELECT company_id, company_name FROM siggem.company WHERE company_id = ANY($1)`,
        [companyIds],
      );

      chargedCompanies = chargedCompaniesData.rows;
    }
    //Skapa HTML
    const createHTML = async (receipt, chargedCompanies) => {
      const representedPage =
        representedData.rows.length > 0
          ? `
    <div ></div>
    <div class="section">
      <h2>Representerade Personer</h2>
      <ul class="vertical-list">
        ${representedData.rows.map((item) => `<li>${item.user_name},</li>`).join("")}
      </ul>
    </div>`
          : "";
      const imagePage =
        imageData.rows.length > 0
          ? `

    ${imageData.rows.map((item) => `<img class="receipt-image" src="${item.link}" alt="Kvitto Bild" />`)}
  `
          : "";

      const representedHeader =
        representedData.rows.length > 0 ? `<th>Antal Representerade</th>` : "";

      const representedCell =
        representedData.rows.length > 0
          ? `<td>${representedData.rows.length}</td>`
          : "";
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      padding: 10px;
      color: #333;
    }

    #header {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
    }

    .sub-header {
      font-size: 12px;
      color: #555;
      margin-bottom: 4px;
    }

    .section {
      margin-top: 10px;
    }

    .info {
      font-size: 11px;
      margin-bottom: 2px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }

    th, td {
      border: 1px solid #ccc;
      padding: 4px;
      text-align: center;
      font-size: 11px;
    }

    th {
      background-color: #f0f0f0;
      font-weight: 600;
    }
.image-container {
  text-align: center;
}

.receipt-image {
  max-height: 800;
  max-width: 500;
  height: auto;
  display: inline-block;
}

    .vertical-list {
      display: flex;
  flex-direction: column;
      gap: 16px;
      font-size: 21px;
      margin-bottom: 8px;
      margin-rgiht:20px;
      list-style-type: none;
      margin: 0;
      padding: 0;
    }

    #footer {
      margin-top: 20px;
      font-size: 10px;
      text-align: center;
      color: #888;
    }

    .info-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .info-row h3 {
      margin: 0;
      font-size: 13px;
      white-space: nowrap;
    }
  </style>
  <title>Receipt Report</title>
</head>
<body>

  <div id="header">${receipt.description}</div>
  <div class="sub-header">${dayjs(receipt.creation_date).format("YYYY-MM-DD")}</div>

<div class="section">
  <div class="info"><strong>Typ:</strong> ${receipt.company_card ? "Företagskort" : "Eget Utlägg"}</div>
  <div class="info"><strong>Användare:</strong> ${user.first_name}</div>
  <div class="info"><strong>Email:</strong> ${user.email}</div>
  <div class="info"><strong>Företag:</strong> ${company.company_name}</div>
</div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Beskrivning</th>
          <th>Netto</th>
          <th>Moms</th>
          <th>Belopp</th>
          <th>Belastade företag</th>
           ${receipt.other ? `<th>Övrigt</th>` : ""}
          ${representedHeader}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${dayjs(receipt.receipt_date).format("YYYY-MM-DD")}</td>
          <td>${receipt.description}</td>
          <td>${receipt.net.toFixed(2)}</td>
          <td>${receipt.tax.toFixed(2)}</td>
          <td>${receipt.total.toFixed(2)}</td>
          <td>${chargedCompanies.map((item) => item.company_name).join(", ")}</td>
           ${receipt.other ? `<td> ${receipt.other}</td>` : ""}
          ${representedCell}
        </tr>
      </tbody>
    </table>  
    ${representedPage}
  </div>  

 <div class="image-container">
${imagePage}
</div>


</body>
</html>`;
    };

    logger.info(`Building HTML for receipt ID ${id}`);
    const html = await createHTML(receipt, chargedCompanies);

    logger.info(`Launching Puppeteer for receipt ID ${id}`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    //Generera pdf buffer
    const pdfBuffer = await page.pdf({ format: "A4" });
    await browser.close();

    logger.info(`PDF successfully generated for receipt ID ${id} `);

    /*const base64 = Buffer.from(pdfBuffer).toString("base64");
    const dataUri = `data:application/pdf;base64,${base64}`;*/

    return pdfBuffer;
  } catch (err) {
    logger.error(`Error generating PDF for receipt ID ${id} :`, err);
    throw err;
  }
};

exports.update = async (
  id,
  {
    creation_date,
    receipt_date,
    company_card,
    net,
    tax,
    image_links,
    description,
    represented,
    charged_companies,
  },
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE siggem.receipt 
       SET creation_date=$1, receipt_date=$2, company_card=$3, net=$4, tax=$5, description=$6
       WHERE receipt_id=$7`,
      [creation_date, receipt_date, company_card, net, tax, description, id],
    );
    logger.info(`Updated receipt ${id}`);

    if (represented !== undefined) {
      await client.query(
        `DELETE FROM siggem.represented_xref WHERE receipt_id = $1`,
        [id],
      );

      if (represented.length > 0) {
        const repInsertPromises = represented.map((r) =>
          client.query(
            `INSERT INTO siggem.represented_xref (receipt_id, user_name)
             VALUES ($1, $2)`,
            [id, r],
          ),
        );
        await Promise.all(repInsertPromises);
        logger.info(`Updated represented_xref for receipt ${id}`);
      }
    }

    if (charged_companies !== undefined) {
      await client.query(
        `DELETE FROM siggem.company_charge_xref WHERE receipt_id = $1`,
        [id],
      );

      if (charged_companies.length > 0) {
        const chargeInsertPromises = charged_companies.map(async (c) => {
          return client.query(
            `INSERT INTO siggem.company_charge_xref (receipt_id, company_id)
             VALUES ($1, $2)`,
            [id, c],
          );
        });

        await Promise.all(chargeInsertPromises);
        logger.info(`Updated company_charge_xref for receipt ${id}`);
      }
    }
    if (image_links !== undefined) {
      await client.query(
        `DELETE FROM siggem.image_xref WHERE receipt_id = $1`,
        [id],
      );

      if (image_links.length > 0) {
        const imageInsertPromises = image_links.map(async (i, index) => {
          return client.query(
            `INSERT INTO siggem.image_xref (link, receipt_id, page_number)
             VALUES ($1, $2)`,
            [id, i, index + 1],
          );
        });

        await Promise.all(imageInsertPromises);
        logger.info(`Updated image_xref for receipt ${id}`);
      }
    }
    await client.query("COMMIT");
    logger.info(`Successfully committed update for receipt ${id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`Transaction rolled back while updating receipt ${id}:`, err);
    throw err;
  } finally {
    client.release();
  }
};

exports.remove = async (id) => {
  try {
    await pool.query(
      "DELETE FROM siggem.represented_xref WHERE receipt_id = $1",
      [id],
    );
    await pool.query(
      "DELETE FROM siggem.company_charge_xref WHERE receipt_id = $1",
      [id],
    );
    await pool.query("DELETE FROM siggem.image_xref WHERE receipt_id = $1", [
      id,
    ]);
    const result = await pool.query(
      "DELETE FROM siggem.receipt WHERE receipt_id = $1",
      [id],
    );

    if (result.rowCount === 0) {
      logger.warn(`Receipt with ID ${id} not found for deletion`);
      const error = new Error("Receipt not found");
      error.status = 404;
      throw error;
    }

    logger.info(`Successfully deleted receipt ${id} and associated records`);
  } catch (err) {
    logger.error(`Error deleting receipt ${id}:`, err);
    throw err;
  }
};
