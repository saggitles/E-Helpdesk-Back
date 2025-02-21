/*
  Warnings:

  - Added the required column `UserID` to the `Comment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "UserID" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("IDUser") ON DELETE RESTRICT ON UPDATE CASCADE;
