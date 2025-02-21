/*
  Warnings:

  - The primary key for the `Ticket` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `ClientID` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `TicketID` on the `Ticket` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `UserID` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Client` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_UserRoles` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `CustomerID` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Made the column `AssignedUserID` on table `Ticket` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `UserRoleID` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_AssignedUserID_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_ClientID_fkey";

-- DropForeignKey
ALTER TABLE "_UserRoles" DROP CONSTRAINT "_UserRoles_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserRoles" DROP CONSTRAINT "_UserRoles_B_fkey";

-- DropIndex
DROP INDEX "User_Email_key";

-- DropIndex
DROP INDEX "User_Username_key";

-- AlterTable
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_pkey",
DROP COLUMN "ClientID",
DROP COLUMN "TicketID",
ADD COLUMN     "CustomerID" INTEGER NOT NULL,
ADD COLUMN     "IDTicket" SERIAL NOT NULL,
ALTER COLUMN "AssignedUserID" SET NOT NULL,
ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY ("IDTicket");

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "UserID",
ADD COLUMN     "IDUser" SERIAL NOT NULL,
ADD COLUMN     "UserRoleID" INTEGER NOT NULL,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("IDUser");

-- DropTable
DROP TABLE "Client";

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "_UserRoles";

-- CreateTable
CREATE TABLE "UserRole" (
    "IDRole" SERIAL NOT NULL,
    "RoleName" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("IDRole")
);

-- CreateTable
CREATE TABLE "Customer" (
    "IDCustomer" SERIAL NOT NULL,
    "CustomerName" TEXT NOT NULL,
    "ContactName" TEXT NOT NULL,
    "Email" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("IDCustomer")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_UserRoleID_fkey" FOREIGN KEY ("UserRoleID") REFERENCES "UserRole"("IDRole") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_AssignedUserID_fkey" FOREIGN KEY ("AssignedUserID") REFERENCES "User"("IDUser") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_CustomerID_fkey" FOREIGN KEY ("CustomerID") REFERENCES "Customer"("IDCustomer") ON DELETE RESTRICT ON UPDATE CASCADE;
