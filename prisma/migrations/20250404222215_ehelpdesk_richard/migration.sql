/*
  Warnings:

  - You are about to drop the column `Site` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "Site",
ADD COLUMN     "SiteName" TEXT;
