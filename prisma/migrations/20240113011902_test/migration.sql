/*
  Warnings:

  - You are about to drop the column `Costumer` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `FirstName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `LastName` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "Costumer";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "FirstName",
DROP COLUMN "LastName";
