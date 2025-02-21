-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "JiraTicketID" INTEGER;

-- CreateTable
CREATE TABLE "JiraTicket" (
    "IDJiraTicket" SERIAL NOT NULL,
    "key" TEXT,
    "self" TEXT,

    CONSTRAINT "JiraTicket_pkey" PRIMARY KEY ("IDJiraTicket")
);

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_JiraTicketID_fkey" FOREIGN KEY ("JiraTicketID") REFERENCES "JiraTicket"("IDJiraTicket") ON DELETE SET NULL ON UPDATE CASCADE;
