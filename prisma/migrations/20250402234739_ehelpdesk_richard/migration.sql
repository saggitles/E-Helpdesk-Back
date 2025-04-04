/*
  Warnings:

  - Made the column `Priority` on table `Ticket` required. This step will fail if there are existing NULL values in that column.
  - Made the column `Category` on table `Ticket` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "Priority" SET NOT NULL,
ALTER COLUMN "Category" SET NOT NULL;
