-- CreateTable
CREATE TABLE "Image" (
    "IDImage" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "TicketID" INTEGER,
    "CommentID" INTEGER,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("IDImage")
);

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_TicketID_fkey" FOREIGN KEY ("TicketID") REFERENCES "Ticket"("IDTicket") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_CommentID_fkey" FOREIGN KEY ("CommentID") REFERENCES "Comment"("IDComment") ON DELETE SET NULL ON UPDATE CASCADE;
