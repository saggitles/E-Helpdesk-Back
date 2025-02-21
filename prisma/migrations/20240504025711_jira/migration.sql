/*
  Warnings:

  - You are about to drop the column `self` on the `JiraTicket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "JiraTicket" DROP COLUMN "self",
ADD COLUMN     "CreationDate" TEXT,
ADD COLUMN     "Description" TEXT,
ADD COLUMN     "ProjectKey" TEXT,
ADD COLUMN     "ProjectName" TEXT,
ADD COLUMN     "ProjectType" TEXT,
ADD COLUMN     "Status" TEXT,
ADD COLUMN     "StatusCategory" TEXT,
ADD COLUMN     "Type" TEXT;
