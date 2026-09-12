import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const portfolios=sqliteTable("portfolios",{owner:text("owner").primaryKey(),payload:text("payload").notNull(),revision:integer("revision").notNull().default(1),updatedAt:text("updated_at").notNull()});
