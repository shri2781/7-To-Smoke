-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "EndReason" AS ENUM ('target_reached', 'cap_reached_manual', 'forced');

-- CreateTable
CREATE TABLE "Dancer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crew" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dancer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TournamentStatus" NOT NULL DEFAULT 'in_progress',
    "targetScore" INTEGER NOT NULL DEFAULT 7,
    "maxMatches" INTEGER NOT NULL DEFAULT 27,
    "winnerParticipantId" TEXT,
    "endReason" "EndReason",
    "completedAt" TIMESTAMP(3),
    "finalStandings" JSONB,
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "dancerId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayCrew" TEXT,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "kingParticipantId" TEXT NOT NULL,
    "challengerParticipantId" TEXT NOT NULL,
    "winnerParticipantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dancer_deletedAt_idx" ON "Dancer"("deletedAt");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_tournamentId_dancerId_key" ON "Participant"("tournamentId", "dancerId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_tournamentId_seed_key" ON "Participant"("tournamentId", "seed");

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_tournamentId_matchNumber_key" ON "Match"("tournamentId", "matchNumber");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_dancerId_fkey" FOREIGN KEY ("dancerId") REFERENCES "Dancer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_kingParticipantId_fkey" FOREIGN KEY ("kingParticipantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_challengerParticipantId_fkey" FOREIGN KEY ("challengerParticipantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerParticipantId_fkey" FOREIGN KEY ("winnerParticipantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
