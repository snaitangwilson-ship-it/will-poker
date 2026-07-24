/*
  Warnings:

  - Added the required column `winners` to the `HandHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "HandHistory" ADD COLUMN     "winners" JSONB NOT NULL;
