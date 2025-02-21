/*
  Warnings:

  - You are about to drop the `Image` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_CommentID_fkey";

-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_TicketID_fkey";

-- DropTable
DROP TABLE "Image";

-- CreateTable
CREATE TABLE "File" (
    "IDFile" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "TicketID" INTEGER,
    "CommentID" INTEGER,

    CONSTRAINT "File_pkey" PRIMARY KEY ("IDFile")
);

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_TicketID_fkey" FOREIGN KEY ("TicketID") REFERENCES "Ticket"("IDTicket") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_CommentID_fkey" FOREIGN KEY ("CommentID") REFERENCES "Comment"("IDComment") ON DELETE SET NULL ON UPDATE CASCADE;
