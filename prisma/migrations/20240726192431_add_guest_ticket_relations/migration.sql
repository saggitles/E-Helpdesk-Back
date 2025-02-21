-- AlterTable
ALTER TABLE "File" ADD COLUMN     "GuestTicketID" INTEGER;

-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "GuestTicketID" INTEGER;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_GuestTicketID_fkey" FOREIGN KEY ("GuestTicketID") REFERENCES "GuestTicket"("IDGuestTicket") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_GuestTicketID_fkey" FOREIGN KEY ("GuestTicketID") REFERENCES "GuestTicket"("IDGuestTicket") ON DELETE SET NULL ON UPDATE CASCADE;
