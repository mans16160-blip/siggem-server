const receiptService = require("../services/receiptService");
const { pool } = require("../db");
const nodemailer = require("nodemailer");
const axios = require("axios");
const logger = require("../logger");
const { getAdminToken } = require("./authController");

async function generateAndEmailDailyReports() {
  const today = new Date().toISOString().split("T")[0];

  const receiptData = await pool.query(
    "SELECT * FROM siggem.receipt WHERE creation_date = $1",
    [today],
  );
  
  const pdfBuffers = [];
  const receipts = receiptData.rows;

  //Gör rapporterna till PDF
  for (const receipt of receipts) {
    try {
      let pdf = await receiptService.generatePDF(receipt.receipt_id);

      if (
        typeof pdf === "string" &&
        pdf.startsWith("data:application/pdf;base64,")
      ) {
        const base64Data = pdf.replace(/^data:application\/pdf;base64,/, "");
        pdf = Buffer.from(base64Data, "base64");
      }
      const userData = await pool.query(
     "SELECT * FROM siggem.user WHERE user_id = $1",
     [receipt.user_id],
     );
  
      pdfBuffers.push({ buf: pdf, receipt: receipt, user:userData.rows[0].first_name });
    } catch (err) {
      console.warn(
        `Failed to generate PDF for receipt ${receipt.receipt_id}: ${err.message}`,
      );
    }
  }

  if (pdfBuffers.length > 0) {
    try {
      const adminEmails = await getAdminEmailsFromKeycloak(); //Hämta admins email

      for (const email of adminEmails) {
        await sendEmailWithAttachments(pdfBuffers, email); //Skicka mail med PDF
        logger.info(`Sent ${pdfBuffers.length} PDFs to ${email}`);
      }
    } catch (err) {
      logger.error(`Failed to send emails to admins: ${err.message}`);
    }
  } else {
    logger.info("No receipts for today");
  }
}

async function getAdminEmailsFromKeycloak() {
  const token = await getAdminToken();

  const response = await axios.get(
    `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/roles/admin/users`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return response.data.filter((user) => user.email).map((user) => user.email);
}

async function sendEmailWithAttachments(pdfs, email) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const attachments = pdfs.map((pdf, i) => ({
    filename: `${pdf.receipt.description}-${pdf.receipt.creation_date.toISOString().split('T')[0]}-${pdf.user}.pdf`,
    content: pdf.buf,
  }));

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: 'mans16160@gmail.com',
    subject: "Dagilga rapporter",
    text: "Här är dagens rapporter.",
    attachments,
  });
}

module.exports = { generateAndEmailDailyReports };
