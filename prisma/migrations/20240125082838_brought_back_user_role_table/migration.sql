/*
  Warnings:

  - You are about to drop the column `UserRole` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "UserRole";

-- CreateTable
CREATE TABLE "UserRole" (
    "IDRole" SERIAL NOT NULL,
    "Name" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("IDRole")
);

-- CreateTable
CREATE TABLE "_UserToUserRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserToUserRole_AB_unique" ON "_UserToUserRole"("A", "B");

-- CreateIndex
CREATE INDEX "_UserToUserRole_B_index" ON "_UserToUserRole"("B");

-- AddForeignKey
ALTER TABLE "_UserToUserRole" ADD CONSTRAINT "_UserToUserRole_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("IDUser") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToUserRole" ADD CONSTRAINT "_UserToUserRole_B_fkey" FOREIGN KEY ("B") REFERENCES "UserRole"("IDRole") ON DELETE CASCADE ON UPDATE CASCADE;
