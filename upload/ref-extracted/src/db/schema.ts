import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const titles = pgTable(
  "titles",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    title: text("title").notNull(),
    titleEn: text("title_en").notNull(),
    type: varchar("type", { length: 10 }).notNull(), // 'movie' | 'series'
    year: integer("year").notNull(),
    rating: real("rating").notNull().default(0),
    duration: integer("duration").notNull().default(0), // minutes (movie) or avg episode
    description: text("description").notNull(),
    genres: text("genres").array().notNull().default([]),
    poster: text("poster").notNull(),
    backdrop: text("backdrop").notNull(),
    videoUrl: text("video_url").notNull(),
    trailerUrl: text("trailer_url"),
    director: text("director").notNull().default(""),
    cast: text("cast").array().notNull().default([]),
    country: text("country").notNull().default("ایران"),
    ageRating: varchar("age_rating", { length: 10 }).notNull().default("+13"),
    quality: varchar("quality", { length: 10 }).notNull().default("4K"),
    featured: boolean("featured").notNull().default(false),
    trendingScore: integer("trending_score").notNull().default(0),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("titles_type_idx").on(t.type), index("titles_trending_idx").on(t.trendingScore)]
);

export const episodes = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    season: integer("season").notNull().default(1),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    synopsis: text("synopsis").notNull().default(""),
    duration: integer("duration").notNull().default(45),
    videoUrl: text("video_url").notNull(),
    thumbnail: text("thumbnail").notNull(),
  },
  (t) => [index("episodes_title_idx").on(t.titleId)]
);

export const watchlist = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    userKey: varchar("user_key", { length: 64 }).notNull(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_user_title_idx").on(t.userKey, t.titleId)]
);

export const watchProgress = pgTable(
  "watch_progress",
  {
    id: serial("id").primaryKey(),
    userKey: varchar("user_key", { length: 64 }).notNull(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    position: real("position").notNull().default(0),
    duration: real("duration").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("progress_user_title_idx").on(t.userKey, t.titleId)]
);

export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    author: varchar("author", { length: 80 }).notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("reviews_title_idx").on(t.titleId)]
);

export const titlesRelations = relations(titles, ({ many }) => ({
  episodes: many(episodes),
  reviews: many(reviews),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  title: one(titles, { fields: [episodes.titleId], references: [titles.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  title: one(titles, { fields: [reviews.titleId], references: [titles.id] }),
}));

export type Title = typeof titles.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type WatchProgress = typeof watchProgress.$inferSelect;
