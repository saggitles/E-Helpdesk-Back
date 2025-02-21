/*
  Warnings:

  - You are about to drop the column `UserRole` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "UserRole",
ADD COLUMN     "UserRoleID" INTEGER;

-- CreateTable
CREATE TABLE "UserRole" (
    "IDRole" SERIAL NOT NULL,
    "RoleName" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("IDRole")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_UserRoleID_fkey" FOREIGN KEY ("UserRoleID") REFERENCES "UserRole"("IDRole") ON DELETE SET NULL ON UPDATE CASCADE;
