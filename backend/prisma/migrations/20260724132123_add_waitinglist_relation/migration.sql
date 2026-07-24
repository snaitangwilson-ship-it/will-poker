/*
  Warnings:

  - You are about to drop the column `communityCards` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `winnerId` on the `Game` table. All the data in the column will be lost.
  - You are about to drop the column `timestamp` on the `HandHistory` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Seat` table. All the data in the column will be lost.
  - You are about to drop the `GameState` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SystemConfig` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tableId,userId]` on the table `WaitingList` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `board` on the `HandHistory` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "WaitingList" DROP CONSTRAINT "WaitingList_userId_fkey";

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "communityCards",
DROP COLUMN "winnerId",
ADD COLUMN     "currentBet" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GamePlayer" ALTER COLUMN "stack" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "HandHistory" DROP COLUMN "timestamp",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rake" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "board",
ADD COLUMN     "board" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "PokerTable" ADD COLUMN     "dealerPosition" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Seat" DROP COLUMN "updatedAt";

-- DropTable
DROP TABLE "GameState";

-- DropTable
DROP TABLE "SystemConfig";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'main',
    "winnerId" TEXT,
    "isDistributed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WaitingList_tableId_userId_key" ON "WaitingList"("tableId", "userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitingList" ADD CONSTRAINT "WaitingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pot" ADD CONSTRAINT "Pot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandHistory" ADD CONSTRAINT "HandHistory_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
