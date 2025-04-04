/*
  Warnings:

  - You are about to drop the column `companyName` on the `GuestTicket` table. All the data in the column will be lost.
  - You are about to drop the column `Companyname` on the `Ticket` table. All the data in the column will be lost.
  - Added the required column `customerName` to the `GuestTicket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GuestTicket" DROP COLUMN "companyName",
ADD COLUMN     "customerName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "Companyname",
ADD COLUMN     "Customername" TEXT;
