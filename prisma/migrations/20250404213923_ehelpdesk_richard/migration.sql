/*
  Warnings:

  - You are about to drop the column `Customername` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "Customername",
ADD COLUMN     "CustomerName" TEXT;
