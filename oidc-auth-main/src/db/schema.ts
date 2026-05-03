import {
  uuid,
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  firstName: varchar("first_name", { length: 25 }),
  lastName: varchar("last_name", { length: 25 }),

  profileImageURL: text("profile_image_url"),

  email: varchar("email", { length: 322 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),

  password: varchar("password", { length: 255 }),
  salt: text("salt"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export const oauthClientsTable = pgTable("oauth_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  clientId: varchar("client_id", { length: 255 }).notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  redirectUri: varchar("redirect_uri", { length: 2000 }).notNull(),
  developerId: uuid("developer_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const oauthCodesTable = pgTable("oauth_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 255 }).notNull().unique(),
  clientId: varchar("client_id", { length: 255 }).notNull(),
  userId: uuid("user_id").references(() => usersTable.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
