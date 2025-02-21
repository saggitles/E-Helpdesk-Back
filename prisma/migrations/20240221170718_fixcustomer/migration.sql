-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_CustomerID_fkey";

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "CustomerID" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_CustomerID_fkey" FOREIGN KEY ("CustomerID") REFERENCES "Customer"("IDCustomer") ON DELETE SET NULL ON UPDATE CASCADE;
