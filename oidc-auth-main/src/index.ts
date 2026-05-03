import "dotenv/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { eq, and } from "drizzle-orm";
import { usersTable, oauthClientsTable, oauthCodesTable } from "./db/schema.js";

export const db: NodePgDatabase = drizzle(process.env.DATABASE_URL || "postgres://admin:admin@localhost:5432/oidc_auth");

const app = express();
app.use(express.json());
app.use(cookieParser());

// Global Error Handler to catch and show errors instead of just "Internal Server Error"
app.use((err, req, res, next) => {
  console.error("🔥 Global Error:", err);
  res.status(500).send(`<h1>Internal Server Error</h1><pre>${err.message}</pre>`);
});

// Serve your frontend HTML files from the "public" folder!
app.use(express.static(path.join(__dirname, "../public")));

// --- Helper: Password Hashing ---
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

// --- Helper: Get or Generate Private Key ---
let cachedPrivateKey: string | null = null;

function getPrivateKey(): string {
  if (cachedPrivateKey) return cachedPrivateKey;

  // Try reading from disk first
  try {
    const keyPath = path.join(__dirname, "../cert/private-key.pem");
    cachedPrivateKey = fs.readFileSync(keyPath, "utf8");
    console.log("✅ Loaded private key from disk.");
    return cachedPrivateKey;
  } catch {
    // Key not found on disk (e.g., on Render), generate one in memory
    console.log("⚠️  Private key file not found. Generating one in memory...");
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    cachedPrivateKey = privateKey;
    console.log("✅ In-memory RSA key pair generated successfully.");
    return cachedPrivateKey;
  }
}

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
    userId: req.cookies.oidc_session,
    expiresAt
  });

  return res.redirect(`${redirect_uri}?code=${shortCode}`);
});

// --- 2.5 User Sign Up API (Used by signup.html) ---
app.post("/o/authenticate/sign-up", async (req, res) => {
  const { firstName, lastName, email, password, client_id, redirect_uri } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  // Check if user already exists
  const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingUser.length > 0) {
    return res.status(409).json({ message: "An account with this email already exists. Please sign in." });
  }

  // Hash the password securely
  const salt = crypto.randomBytes(16).toString("hex");
  const hashedPassword = hashPassword(password, salt);

  // Insert the new user
  const newUser = await db.insert(usersTable).values({
    firstName: firstName || null,
    lastName: lastName || null,
    email,
    password: hashedPassword,
    salt,
  }).returning({ id: usersTable.id });

  const userId = newUser[0].id;

  // Set the session cookie
  res.cookie("oidc_session", userId, { httpOnly: true, sameSite: "lax" });

  // If they came from an app, redirect back to /authorize
  if (client_id && redirect_uri) {
    return res.json({ redirect: `/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}` });
  }

  return res.json({ message: "Account created successfully!" });
});

// --- 2.6 User Sign In API (Used by authenticate.html) ---
app.post("/o/authenticate/sign-in", async (req, res) => {
  const { email, password, client_id, redirect_uri } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Missing email or password" });

  // Look up the user in the database
  const userResult = await db.select().from(usersTable).where(eq(usersTable.email, email));
  const user = userResult[0];

  // User not found
  if (!user) {
    return res.status(401).json({ message: "User ID and password don't exist. Please sign up first." });
  }

  // Verify password
  if (!user.password || !user.salt) {
    return res.status(401).json({ message: "Invalid credentials. Please sign up again." });
  }

  const hashedAttempt = hashPassword(password, user.salt);
  if (hashedAttempt !== user.password) {
    return res.status(401).json({ message: "Incorrect password. Please try again." });
  }

  // Set the session cookie to the real user ID
  res.cookie("oidc_session", user.id, { httpOnly: true, sameSite: "lax" });

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
    const privateKey = getPrivateKey();
    const token = jwt.sign(
      { userId: validCode.userId || "unknown", role: "user" },
      privateKey,
      { algorithm: "RS256", expiresIn: "1h" }
    );
    return res.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
  } catch (err) {
    console.error("Token signing error:", err);
    return res.status(500).json({ error: "Failed to generate token." });
  }
});

const PORT = process.env.PORT || 9005;

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Server started on port ${PORT}`);
  console.log(`Link: http://localhost:${PORT}`);
  console.log(`=================================`);
});
