-- CreateTable
CREATE TABLE "Comment" (
    "IDComment" SERIAL NOT NULL,
    "Content" TEXT NOT NULL,
    "TicketID" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("IDComment")
);

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_TicketID_fkey" FOREIGN KEY ("TicketID") REFERENCES "Ticket"("IDTicket") ON DELETE RESTRICT ON UPDATE CASCADE;
