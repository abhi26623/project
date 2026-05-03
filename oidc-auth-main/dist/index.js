"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
require("dotenv/config");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const drizzle_orm_1 = require("drizzle-orm");
const schema_js_1 = require("./db/schema.js");
exports.db = (0, node_postgres_1.drizzle)(process.env.DATABASE_URL || "postgres://admin:admin@localhost:5432/oidc_auth");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Serve your frontend HTML files from the "public" folder!
app.use(express_1.default.static(path_1.default.join(__dirname, "../public")));
// --- Helper: Password Hashing ---
function hashPassword(password, salt) {
    return crypto_1.default.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}
// --- Helper: Get or Generate RSA Key Pair ---
let cachedPrivateKey = null;
let cachedPublicKey = null;
function getPrivateKey() {
    if (cachedPrivateKey)
        return cachedPrivateKey;
    // Try reading from disk first
    try {
        const keyPath = path_1.default.join(__dirname, "../cert/private-key.pem");
        cachedPrivateKey = fs_1.default.readFileSync(keyPath, "utf8");
        // Derive the public key from the private key
        cachedPublicKey = crypto_1.default.createPublicKey(cachedPrivateKey).export({ type: "spki", format: "pem" });
        console.log("Loaded private key from disk.");
        return cachedPrivateKey;
    }
    catch {
        // Key not found on disk (e.g., on Render), generate one in memory
        console.log("Private key file not found. Generating one in memory...");
        const { privateKey, publicKey } = crypto_1.default.generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        cachedPrivateKey = privateKey;
        cachedPublicKey = publicKey;
        console.log("In-memory RSA key pair generated successfully.");
        return cachedPrivateKey;
    }
}
function getPublicKey() {
    if (!cachedPublicKey)
        getPrivateKey(); // ensure keys are initialised
    return cachedPublicKey;
}
app.get("/", (req, res) => {
    res.send("<h1>OIDC Auth Server is Running!</h1>");
});
// --- Public Key Endpoint (so clients can verify RS256 tokens) ---
app.get("/public-key", (req, res) => {
    res.set("Content-Type", "text/plain");
    res.send(getPublicKey());
});
// --- 1. Developer App Registration ---
app.post("/api/developer/register", async (req, res) => {
    try {
        const { name, redirectUri } = req.body;
        if (!name || !redirectUri)
            return res.status(400).json({ error: "Missing fields" });
        const clientId = crypto_1.default.randomBytes(16).toString("hex");
        const clientSecret = crypto_1.default.randomBytes(32).toString("hex");
        await exports.db.insert(schema_js_1.oauthClientsTable).values({
            name,
            clientId,
            clientSecretHash: clientSecret,
            redirectUri
        });
        res.json({ client_id: clientId, client_secret: clientSecret });
    }
    catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ error: err.message });
    }
});
// --- 2. Authorization Endpoint (Frontend Flow) ---
app.get("/authorize", async (req, res) => {
    try {
        const { client_id, redirect_uri } = req.query;
        if (!client_id || !redirect_uri)
            return res.status(400).send("Missing client_id or redirect_uri");
        const clientResult = await exports.db.select().from(schema_js_1.oauthClientsTable).where((0, drizzle_orm_1.eq)(schema_js_1.oauthClientsTable.clientId, String(client_id)));
        const client = clientResult[0];
        if (!client || client.redirectUri !== redirect_uri)
            return res.status(400).send("Invalid client or redirect URI mismatch");
        // Check if user is logged into the OIDC server
        const sessionUserId = req.cookies.oidc_session;
        if (!sessionUserId) {
            return res.redirect(`/authenticate.html?client_id=${client_id}&redirect_uri=${redirect_uri}&app_name=${encodeURIComponent(client.name)}`);
        }
        // Validate the session cookie is a real UUID (not an old dummy value)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(sessionUserId)) {
            // Old invalid cookie — clear it and send to login
            res.clearCookie("oidc_session");
            return res.redirect(`/authenticate.html?client_id=${client_id}&redirect_uri=${redirect_uri}&app_name=${encodeURIComponent(client.name)}`);
        }
        // Verify user still exists in the database (Self-healing)
        const userResult = await exports.db.select().from(schema_js_1.usersTable).where((0, drizzle_orm_1.eq)(schema_js_1.usersTable.id, sessionUserId));
        if (userResult.length === 0) {
            console.warn("Session user not found in DB. Clearing cookie.");
            res.clearCookie("oidc_session");
            return res.redirect(`/authenticate.html?client_id=${client_id}&redirect_uri=${redirect_uri}&app_name=${encodeURIComponent(client.name)}`);
        }
        // Generate short code
        const shortCode = crypto_1.default.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 1000); // 1 min expiration
        await exports.db.insert(schema_js_1.oauthCodesTable).values({
            code: shortCode,
            clientId: String(client_id),
            userId: sessionUserId,
            expiresAt
        });
        return res.redirect(`${redirect_uri}?code=${shortCode}`);
    }
    catch (err) {
        console.error("Authorize error:", err);
        res.status(500).send(`<h1>Authorization Error</h1><pre>${err.message}</pre>`);
    }
});
// --- 2.5 User Sign Up API (Used by signup.html) ---
app.post("/o/authenticate/sign-up", async (req, res) => {
    try {
        const { firstName, lastName, email, password, client_id, redirect_uri } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters." });
        }
        // Check if user already exists
        const existingUser = await exports.db.select().from(schema_js_1.usersTable).where((0, drizzle_orm_1.eq)(schema_js_1.usersTable.email, email));
        if (existingUser.length > 0) {
            return res.status(409).json({ message: "An account with this email already exists. Please sign in." });
        }
        // Hash the password securely
        const salt = crypto_1.default.randomBytes(16).toString("hex");
        const hashedPassword = hashPassword(password, salt);
        // Insert the new user
        const newUser = await exports.db.insert(schema_js_1.usersTable).values({
            firstName: firstName || null,
            lastName: lastName || null,
            email,
            password: hashedPassword,
            salt,
        }).returning({ id: schema_js_1.usersTable.id });
        const userId = newUser[0].id;
        // Set the session cookie
        res.cookie("oidc_session", userId, { httpOnly: true, sameSite: "lax" });
        // If they came from an app, redirect back to /authorize
        if (client_id && redirect_uri) {
            return res.json({ redirect: `/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}` });
        }
        return res.json({ message: "Account created successfully!" });
    }
    catch (err) {
        console.error("Sign-up error:", err);
        res.status(500).json({ message: err.message });
    }
});
// --- 2.6 User Sign In API (Used by authenticate.html) ---
app.post("/o/authenticate/sign-in", async (req, res) => {
    try {
        const { email, password, client_id, redirect_uri } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: "Missing email or password" });
        // Look up the user in the database
        const userResult = await exports.db.select().from(schema_js_1.usersTable).where((0, drizzle_orm_1.eq)(schema_js_1.usersTable.email, email));
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
            return res.json({ redirect: `/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}` });
        }
        return res.json({ message: "Logged in successfully" });
    }
    catch (err) {
        console.error("Sign-in error:", err);
        res.status(500).json({ message: err.message });
    }
});
// --- 3. Token Endpoint (Backend Exchange Flow) ---
app.post("/token", async (req, res) => {
    try {
        const { client_id, client_secret, code } = req.body;
        const clientResult = await exports.db.select().from(schema_js_1.oauthClientsTable).where((0, drizzle_orm_1.eq)(schema_js_1.oauthClientsTable.clientId, client_id));
        const client = clientResult[0];
        if (!client || client.clientSecretHash !== client_secret)
            return res.status(401).json({ error: "Unauthorized Client" });
        const codeResult = await exports.db.select().from(schema_js_1.oauthCodesTable).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.oauthCodesTable.code, code), (0, drizzle_orm_1.eq)(schema_js_1.oauthCodesTable.clientId, client_id)));
        const validCode = codeResult[0];
        if (!validCode || validCode.expiresAt < new Date())
            return res.status(400).json({ error: "Invalid or expired code" });
        await exports.db.delete(schema_js_1.oauthCodesTable).where((0, drizzle_orm_1.eq)(schema_js_1.oauthCodesTable.id, validCode.id));
        // Look up the user to include their info in the token
        let userName = "User";
        let userEmail = "";
        if (validCode.userId) {
            const userResult = await exports.db.select().from(schema_js_1.usersTable).where((0, drizzle_orm_1.eq)(schema_js_1.usersTable.id, validCode.userId));
            const user = userResult[0];
            if (user) {
                userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "User";
                userEmail = user.email;
            }
        }
        const privateKey = getPrivateKey();
        const token = jsonwebtoken_1.default.sign({ userId: validCode.userId || "unknown", name: userName, email: userEmail, role: "user" }, privateKey, { algorithm: "RS256", expiresIn: "1h" });
        return res.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
    }
    catch (err) {
        console.error("Token error:", err);
        return res.status(500).json({ error: err.message });
    }
});
const PORT = process.env.PORT || 9005;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`Server started on port ${PORT}`);
    console.log(`Link: http://localhost:${PORT}`);
    console.log(`=================================`);
});
//# sourceMappingURL=index.js.map