// netlify/functions/stripe-webhook.js
// Listens for Stripe payment confirmations and saves them to Google Sheets

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

// Map Stripe Payment Link price IDs to service names
// ⚠️ After creating your Payment Links, update these price IDs from your Stripe Dashboard
const PRICE_TO_SERVICE = {
  // Format: "price_xxxxxxxxxxxx": "Service Name – $Amount"
  // Replace these with your actual Price IDs from dashboard.stripe.com → Products
  PRICE_ID_SWEDISH:    "Swedish Relaxation – $150",
  PRICE_ID_DEEP_60:    "Deep Tissue Therapy 60min – $200",
  PRICE_ID_DEEP_90:    "Deep Tissue Therapy 90min – $300",
  PRICE_ID_VIP:        "VIP Signature Session – $500",
};

async function getOrCreateSheet(doc) {
  let sheet = doc.sheetsByTitle["Payments"];
  if (!sheet) {
    sheet = await doc.addSheet({
      title: "Payments",
      headerValues: [
        "Timestamp",
        "Client Name",
        "Client Email",
        "Phone",
        "Service",
        "Amount Paid",
        "Currency",
        "Payment Status",
        "Stripe Session ID",
        "Stripe Customer ID",
        "Payment Date",
      ],
    });
  }
  return sheet;
}

async function getOrCreateBookingsSheet(doc) {
  return doc.sheetsByTitle["Bookings"];
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Only handle successful checkouts
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;

    try {
      // Get full session with line items
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "customer_details"],
      });

      const customerName    = fullSession.customer_details?.name || "Unknown";
      const customerEmail   = fullSession.customer_details?.email || "";
      const customerPhone   = fullSession.customer_details?.phone || "";
      const amountPaid      = (fullSession.amount_total / 100).toFixed(2);
      const currency        = fullSession.currency.toUpperCase();
      const sessionId       = fullSession.id;
      const stripeCustomerId = fullSession.customer || "";
      const paymentStatus   = fullSession.payment_status;
      const paidAt          = new Date(fullSession.created * 1000).toLocaleString("en-US", {
        timeZone: "America/Chicago",
      });

      // Determine service from line items
      const lineItem   = fullSession.line_items?.data?.[0];
      const priceId    = lineItem?.price?.id || "";
      const serviceName = PRICE_TO_SERVICE[priceId] || lineItem?.description || "Service";

      // ── Connect to Google Sheets ──
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

      // ── 1. Add row to Payments sheet ──
      const paymentsSheet = await getOrCreateSheet(doc);
      await paymentsSheet.addRow({
        Timestamp:           new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
        "Client Name":       customerName,
        "Client Email":      customerEmail,
        Phone:               customerPhone,
        Service:             serviceName,
        "Amount Paid":       `$${amountPaid}`,
        Currency:            currency,
        "Payment Status":    paymentStatus === "paid" ? "✅ Paid" : paymentStatus,
        "Stripe Session ID": sessionId,
        "Stripe Customer ID": stripeCustomerId,
        "Payment Date":      paidAt,
      });

      // ── 2. Update matching row in Bookings sheet if exists ──
      const bookingsSheet = await getOrCreateBookingsSheet(doc);
      if (bookingsSheet) {
        const rows = await bookingsSheet.getRows();
        // Try to match by phone or name
        const match = rows.find(
          (r) =>
            r.get("Phone") === customerPhone ||
            r.get("Client Name")?.toLowerCase() === customerName.toLowerCase()
        );
        if (match) {
          match.set("Payment Status", "✅ Paid");
          match.set("Amount Paid", `$${amountPaid}`);
          match.set("Stripe Session ID", sessionId);
          await match.save();
        }
      }

      console.log(`✅ Payment saved: ${customerName} – ${serviceName} – $${amountPaid}`);
    } catch (err) {
      console.error("Error saving payment to Sheets:", err);
      return { statusCode: 500, body: "Failed to save payment data" };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
