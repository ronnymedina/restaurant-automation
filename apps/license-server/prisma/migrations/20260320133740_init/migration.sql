-- CreateTable
CREATE TABLE "License" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "machineId" TEXT,
    "platform" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'desktop',
    "activatedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'available',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
