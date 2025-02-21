/*
  Warnings:

  - You are about to drop the column `UserRoleID` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `UserRole` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_UserRoleID_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "UserRoleID",
ADD COLUMN     "UserRole" TEXT NOT NULL DEFAULT 'defaultUserRole';

-- DropTable
DROP TABLE "UserRole";
