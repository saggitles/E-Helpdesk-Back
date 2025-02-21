-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_AssignedUserID_fkey";

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "incidentDate" TIMESTAMP(3),
ALTER COLUMN "AssignedUserID" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_AssignedUserID_fkey" FOREIGN KEY ("AssignedUserID") REFERENCES "User"("IDUser") ON DELETE SET NULL ON UPDATE CASCADE;
