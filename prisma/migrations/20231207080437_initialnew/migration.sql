/*
  Warnings:

  - Added the required column `CustomerID` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "CustomerID" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_CustomerID_fkey" FOREIGN KEY ("CustomerID") REFERENCES "Customer"("IDCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;
