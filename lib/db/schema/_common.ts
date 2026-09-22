import { timestamp, uuid, boolean, jsonb } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";

export const id = () => uuid("id").primaryKey().$defaultFn(newId);
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const isDemo = () => boolean("is_demo").notNull().default(false);
export const metadata = () => jsonb("metadata").$type<Record<string, unknown>>().notNull().default({});
