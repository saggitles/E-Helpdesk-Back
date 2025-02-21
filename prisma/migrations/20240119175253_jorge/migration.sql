/*
  Warnings:

  - You are about to drop the column `Costumer` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "Costumer",
ADD COLUMN     "Companyname" TEXT;
