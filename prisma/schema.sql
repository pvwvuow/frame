-- CreateTable
CREATE TABLE "Title" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rating" REAL NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "genres" TEXT NOT NULL DEFAULT '[]',
    "poster" TEXT NOT NULL,
    "backdrop" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "trailerUrl" TEXT,
    "director" TEXT NOT NULL DEFAULT '',
    "cast" TEXT NOT NULL DEFAULT '[]',
    "country" TEXT NOT NULL DEFAULT 'ایران',
    "ageRating" TEXT NOT NULL DEFAULT '+13',
    "quality" TEXT NOT NULL DEFAULT '4K',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "trendingScore" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'demo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titleId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 1,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL DEFAULT 45,
    "videoUrl" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    CONSTRAINT "Episode_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userKey" TEXT NOT NULL,
    "titleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "note" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Watchlist_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userKey" TEXT NOT NULL,
    "titleId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userKey" TEXT NOT NULL,
    "titleId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRating_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchProgress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userKey" TEXT NOT NULL,
    "titleId" INTEGER NOT NULL,
    "episodeId" INTEGER,
    "position" REAL NOT NULL DEFAULT 0,
    "duration" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchProgress_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titleId" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT 'کاربر نما',
    "avatar" INTEGER NOT NULL DEFAULT 0,
    "autoplay" BOOLEAN NOT NULL DEFAULT true,
    "autoNext" BOOLEAN NOT NULL DEFAULT true,
    "quality" TEXT NOT NULL DEFAULT 'auto',
    "subtitle" TEXT NOT NULL DEFAULT 'fa',
    "matureContent" BOOLEAN NOT NULL DEFAULT true,
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "skipIntro" BOOLEAN NOT NULL DEFAULT true,
    "playbackSpeed" REAL NOT NULL DEFAULT 1,
    "volume" INTEGER NOT NULL DEFAULT 80,
    "dataSaver" BOOLEAN NOT NULL DEFAULT false,
    "notifyNewEpisodes" BOOLEAN NOT NULL DEFAULT true,
    "notifyRecommendations" BOOLEAN NOT NULL DEFAULT true,
    "notifyContinue" BOOLEAN NOT NULL DEFAULT true,
    "kidsMode" BOOLEAN NOT NULL DEFAULT false,
    "parentalPin" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'fa',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Title_slug_key" ON "Title"("slug");

-- CreateIndex
CREATE INDEX "Title_type_idx" ON "Title"("type");

-- CreateIndex
CREATE INDEX "Title_trendingScore_idx" ON "Title"("trendingScore");

-- CreateIndex
CREATE INDEX "Episode_titleId_idx" ON "Episode"("titleId");

-- CreateIndex
CREATE INDEX "Watchlist_userKey_status_idx" ON "Watchlist"("userKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userKey_titleId_key" ON "Watchlist"("userKey", "titleId");

-- CreateIndex
CREATE INDEX "Favorite_userKey_idx" ON "Favorite"("userKey");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userKey_titleId_key" ON "Favorite"("userKey", "titleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRating_userKey_titleId_key" ON "UserRating"("userKey", "titleId");

-- CreateIndex
CREATE INDEX "WatchProgress_userKey_updatedAt_idx" ON "WatchProgress"("userKey", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchProgress_userKey_titleId_key" ON "WatchProgress"("userKey", "titleId");

-- CreateIndex
CREATE INDEX "Review_titleId_idx" ON "Review"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userKey_key" ON "UserProfile"("userKey");

