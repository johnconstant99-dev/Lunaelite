// netlify/functions/submit-booking.js
// Receives booking form submissions and saves to Google Sheets

const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const body = JSON.parse(event.body);
    const { name, phone, service, date, notes } = body;

    if (!name || !phone || !service) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // ── Google Sheets Auth ──
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(
      process.env.GOOGLE_SHEET_ID,
      serviceAccountAuth
    );
    await doc.loadInfo();

    // Use or create "Bookings" sheet
    let sheet = doc.sheetsByTitle["Bookings"];
    if (!sheet) {
      sheet = await doc.addSheet({
        title: "Bookings",
        headerValues: [
          "Timestamp",
          "Client Name",
          "Phone",
          "Service",
          "Preferred Date/Time",
          "Notes",
          "Payment Status",
          "Amount Paid",
          "Stripe Session ID",
          "Source",
        ],
      });
    }

    // Append the booking row
    await sheet.addRow({
      Timestamp: new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
      "Client Name": name,
      Phone: phone,
      Service: service,
      "Preferred Date/Time": date || "Not specified",
      Notes: notes || "",
      "Payment Status": "Pending",
      "Amount Paid": "",
      "Stripe Session ID": "",
      Source: "Booking Form",
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Booking received!" }),
    };
  } catch (err) {
    console.error("submit-booking error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to save booking." }),
    };
  }
};
