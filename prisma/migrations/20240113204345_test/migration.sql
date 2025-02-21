/*
  Warnings:

  - You are about to drop the column `Costuemr` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "Costuemr",
ADD COLUMN     "Costumer" TEXT;
