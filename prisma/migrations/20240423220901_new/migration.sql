-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_UserID_fkey";

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "UserID" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_UserID_fkey" FOREIGN KEY ("UserID") REFERENCES "User"("IDUser") ON DELETE SET NULL ON UPDATE CASCADE;
