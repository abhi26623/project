"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthCodesTable = exports.oauthClientsTable = exports.usersTable = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.usersTable = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    firstName: (0, pg_core_1.varchar)("first_name", { length: 25 }),
    lastName: (0, pg_core_1.varchar)("last_name", { length: 25 }),
    profileImageURL: (0, pg_core_1.text)("profile_image_url"),
    email: (0, pg_core_1.varchar)("email", { length: 322 }).notNull(),
    emailVerified: (0, pg_core_1.boolean)("email_verified").default(false).notNull(),
    password: (0, pg_core_1.varchar)("password", { length: 255 }),
    salt: (0, pg_core_1.text)("salt"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").$onUpdate(() => new Date()),
});
exports.oauthClientsTable = (0, pg_core_1.pgTable)("oauth_clients", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    clientId: (0, pg_core_1.varchar)("client_id", { length: 255 }).notNull().unique(),
    clientSecretHash: (0, pg_core_1.text)("client_secret_hash").notNull(),
    redirectUri: (0, pg_core_1.varchar)("redirect_uri", { length: 2000 }).notNull(),
    developerId: (0, pg_core_1.uuid)("developer_id").references(() => exports.usersTable.id),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.oauthCodesTable = (0, pg_core_1.pgTable)("oauth_codes", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    code: (0, pg_core_1.varchar)("code", { length: 255 }).notNull().unique(),
    clientId: (0, pg_core_1.varchar)("client_id", { length: 255 }).notNull(),
    userId: (0, pg_core_1.uuid)("user_id").references(() => exports.usersTable.id),
    expiresAt: (0, pg_core_1.timestamp)("expires_at").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
//# sourceMappingURL=schema.js.map