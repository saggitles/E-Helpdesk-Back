/*
  Warnings:

  - You are about to drop the column `Name` on the `UserRole` table. All the data in the column will be lost.
  - You are about to drop the `_UserToUserRole` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `RoleName` to the `UserRole` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_UserToUserRole" DROP CONSTRAINT "_UserToUserRole_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserToUserRole" DROP CONSTRAINT "_UserToUserRole_B_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "UserRoleID" INTEGER;

-- AlterTable
ALTER TABLE "UserRole" DROP COLUMN "Name",
ADD COLUMN     "RoleName" TEXT NOT NULL;

-- DropTable
DROP TABLE "_UserToUserRole";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_UserRoleID_fkey" FOREIGN KEY ("UserRoleID") REFERENCES "UserRole"("IDRole") ON DELETE SET NULL ON UPDATE CASCADE;
