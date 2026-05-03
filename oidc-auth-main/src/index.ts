import "dotenv/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { eq, and } from "drizzle-orm";
import { oauthClientsTable, oauthCodesTable } from "./db/schema.js";

export const db: NodePgDatabase = drizzle(process.env.DATABASE_URL || "postgres://admin:admin@localhost:5432/oidc_auth");

const app = express();
app.use(express.json());
app.use(cookieParser());

// Serve your frontend HTML files from the "public" folder!
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.send("<h1>OIDC Auth Server is Running!</h1>");
});

// --- 1. Developer App Registration ---
app.post("/api/developer/register", async (req, res) => {
  const { name, redirectUri } = req.body;
  if (!name || !redirectUri) return res.status(400).json({ error: "Missing fields" });

  const clientId = crypto.randomBytes(16).toString("hex");
  const clientSecret = crypto.randomBytes(32).toString("hex");
  
  await db.insert(oauthClientsTable).values({
    name,
    clientId,
    clientSecretHash: clientSecret,
    redirectUri
  });

  res.json({ client_id: clientId, client_secret: clientSecret });
});

// --- 2. Authorization Endpoint (Frontend Flow) ---
app.get("/authorize", async (req, res) => {
  const { client_id, redirect_uri } = req.query;
  
  if (!client_id || !redirect_uri) return res.status(400).send("Missing client_id or redirect_uri");

  const clientResult = await db.select().from(oauthClientsTable).where(eq(oauthClientsTable.clientId, String(client_id)));
  const client = clientResult[0];

  if (!client || client.redirectUri !== redirect_uri) return res.status(400).send("Invalid client or redirect URI mismatch");

  // Check if user is logged into the OIDC server
  if (!req.cookies.oidc_session) {
    return res.redirect(`/authenticate.html?client_id=${client_id}&redirect_uri=${redirect_uri}&app_name=${encodeURIComponent(client.name)}`);
  }

  // Generate short code
  const shortCode = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 1000); // 1 min expiration
  
  await db.insert(oauthCodesTable).values({
    code: shortCode,
    clientId: String(client_id),
    expiresAt
  });

  return res.redirect(`${redirect_uri}?code=${shortCode}`);
});

// --- 2.5 User Sign In API (Used by authenticate.html) ---
app.post("/o/authenticate/sign-in", async (req, res) => {
  const { email, password, client_id, redirect_uri } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Missing email or password" });

  // Set the session cookie so the user is "logged in" to OIDC
  res.cookie("oidc_session", "dummy_user_123", { httpOnly: true });

  if (client_id && redirect_uri) {
    // Send them back to the /authorize route, which will now see the cookie and generate the short-code!
    return res.json({ redirect: `/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}` });
  }

  return res.json({ message: "Logged in successfully" });
});

// --- 3. Token Endpoint (Backend Exchange Flow) ---
app.post("/token", async (req, res) => {
  const { client_id, client_secret, code } = req.body;

  const clientResult = await db.select().from(oauthClientsTable).where(eq(oauthClientsTable.clientId, client_id));
  const client = clientResult[0];

  if (!client || client.clientSecretHash !== client_secret) return res.status(401).json({ error: "Unauthorized Client" });

  const codeResult = await db.select().from(oauthCodesTable).where(and(eq(oauthCodesTable.code, code), eq(oauthCodesTable.clientId, client_id)));
  const validCode = codeResult[0];

  if (!validCode || validCode.expiresAt < new Date()) return res.status(400).json({ error: "Invalid or expired code" });

  await db.delete(oauthCodesTable).where(eq(oauthCodesTable.id, validCode.id));

  try {
    const privateKey = fs.readFileSync(path.join(__dirname, "../cert/private-key.pem"), "utf8");
    const token = jwt.sign({ userId: "123", username: "admin", role: "user" }, privateKey, { algorithm: "RS256", expiresIn: "1h" });
    return res.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
  } catch (err) {
    return res.status(500).json({ error: "Server missing private key!" });
  }
});

const PORT = process.env.PORT || 9005;

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Server started on port ${PORT}`);
  console.log(`Link: http://localhost:${PORT}`);
  console.log(`=================================`);
});
