-- CreateTable
CREATE TABLE "GameState" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatReservation" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SittingOutPlayer" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SittingOutPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameState_gameId_key" ON "GameState"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_seatId_key" ON "SeatReservation"("seatId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_tableId_userId_key" ON "SeatReservation"("tableId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SittingOutPlayer_seatId_key" ON "SittingOutPlayer"("seatId");

-- CreateIndex
CREATE UNIQUE INDEX "SittingOutPlayer_tableId_userId_key" ON "SittingOutPlayer"("tableId", "userId");

-- AddForeignKey
ALTER TABLE "GameState" ADD CONSTRAINT "GameState_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SittingOutPlayer" ADD CONSTRAINT "SittingOutPlayer_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SittingOutPlayer" ADD CONSTRAINT "SittingOutPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SittingOutPlayer" ADD CONSTRAINT "SittingOutPlayer_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
