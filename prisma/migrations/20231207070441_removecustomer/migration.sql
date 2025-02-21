/*
  Warnings:

  - You are about to drop the column `CustomerID` on the `Ticket` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_CustomerID_fkey";

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "CustomerID";
