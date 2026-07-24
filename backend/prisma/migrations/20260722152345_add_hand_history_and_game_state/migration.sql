-- CreateTable
CREATE TABLE "HandHistory" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "players" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "pot" INTEGER NOT NULL,
    "board" TEXT[],
    "winnerId" TEXT NOT NULL,
    "winnerHand" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameState" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameState_tableId_key" ON "GameState"("tableId");
