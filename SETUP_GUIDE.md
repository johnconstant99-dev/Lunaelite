# Luna Elite – Backend Setup Guide
## Google Sheets + Stripe Webhooks + Netlify Functions

Everything auto-saves to Google Sheets the moment a client books or pays.

---

## 📋 What Gets Saved

| Sheet | Captured When | Fields |
|-------|--------------|--------|
| **Bookings** | Form submitted | Name, Phone, Service, Date, Notes, Payment Status |
| **Payments** | Stripe payment confirmed | Name, Email, Phone, Service, Amount, Status, Session ID |

---

## STEP 1 — Google Sheets Setup (10 min)

### 1a. Create your Google Sheet
1. Go to [sheets.google.com](https://sheets.google.com) → **+ New**
2. Name it: **Luna Elite Bookings**
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`

### 1b. Create a Google Cloud Service Account
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project called **LunaElite**
3. Go to **APIs & Services → Enable APIs** → enable **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → + Create Service Account**
   - Name: `lunaelite-sheets`
   - Role: **Editor**
5. Click the service account → **Keys → Add Key → JSON**
6. Download the JSON file — you'll need two values from it:
   - `client_email` → this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is your `GOOGLE_PRIVATE_KEY`

### 1c. Share your Sheet with the service account
1. Open your Google Sheet
2. Click **Share**
3. Add the `client_email` from above as an **Editor**
4. Click **Send**

---

## STEP 2 — Deploy to Netlify (5 min)

1. Push this project folder to a **GitHub repo**
2. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**
3. Select your repo
4. Build settings will auto-detect from `netlify.toml`
5. Click **Deploy site**

### Add Environment Variables
In Netlify → **Site Settings → Environment Variables**, add:

```
STRIPE_SECRET_KEY          = sk_live_xxxx   (from Stripe Dashboard → API Keys)
STRIPE_WEBHOOK_SECRET      = whsec_xxxx     (set up in Step 3)
GOOGLE_SHEET_ID            = your sheet ID
GOOGLE_SERVICE_ACCOUNT_EMAIL = xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY         = -----BEGIN RSA PRIVATE KEY-----\n...
```

> ⚠️ For `GOOGLE_PRIVATE_KEY`: copy the entire `private_key` value from the JSON file, including `-----BEGIN` and `-----END` lines.

---

## STEP 3 — Stripe Webhook Setup (5 min)

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → Webhooks**
2. Click **+ Add endpoint**
3. Endpoint URL:
   ```
   https://YOUR-NETLIFY-SITE.netlify.app/.netlify/functions/stripe-webhook
   ```
4. Events to listen for: **`checkout.session.completed`**
5. Copy the **Signing secret** → paste as `STRIPE_WEBHOOK_SECRET` in Netlify

---

## STEP 4 — Create Stripe Payment Links (5 min)

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Payment Links → + New**
2. Create one for each service:

| Service | Price |
|---------|-------|
| Swedish Relaxation | $150 |
| Deep Tissue Therapy 60min | $200 |
| Deep Tissue Therapy 90min | $300 |
| VIP Signature Session | $500 |

3. For each link, copy the **Price ID** (starts with `price_`) from the product page
4. Open `netlify/functions/stripe-webhook.js` and update `PRICE_TO_SERVICE`:
   ```js
   const PRICE_TO_SERVICE = {
     "price_abc123": "Swedish Relaxation – $150",
     "price_def456": "Deep Tissue Therapy 60min – $200",
     "price_ghi789": "Deep Tissue Therapy 90min – $300",
     "price_jkl012": "VIP Signature Session – $500",
   };
   ```
5. Open `public/index.html` and replace the 4 `PASTE_STRIPE_LINK_X_HERE` placeholders with your actual Payment Link URLs

---

## STEP 5 — Enable Phone Collection in Stripe

So phone numbers appear in your Payments sheet:
1. Stripe Dashboard → **Payment Links** → edit each link
2. Under **Options** → enable **Phone number collection**

---

## ✅ You're Live!

Once set up, your Google Sheet will automatically receive:
- A new row in **Bookings** every time the form is submitted
- A new row in **Payments** every time a client completes a Stripe payment
- Bookings rows will be auto-updated with payment status when paid

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| Form submits but nothing in Sheets | Check Netlify function logs → Site → Functions |
| Webhook not firing | Verify URL in Stripe matches your Netlify URL exactly |
| Auth error | Re-share the Google Sheet with the service account email |
| Private key error | Make sure `\n` newlines are preserved in the env variable |
