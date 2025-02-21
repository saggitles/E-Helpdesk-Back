/*
  Warnings:

  - The primary key for the `Ticket` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `Descripcion` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `Estado` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `IDCliente` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `IDTicket` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `IDUsuarioAsignado` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `Prioridad` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `Titulo` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the `Cliente` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Rol` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Usuario` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_UsuarioRoles` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ClientID` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Description` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Priority` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Status` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Title` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_IDCliente_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_IDUsuarioAsignado_fkey";

-- DropForeignKey
ALTER TABLE "_UsuarioRoles" DROP CONSTRAINT "_UsuarioRoles_A_fkey";

-- DropForeignKey
ALTER TABLE "_UsuarioRoles" DROP CONSTRAINT "_UsuarioRoles_B_fkey";

-- AlterTable
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_pkey",
DROP COLUMN "Descripcion",
DROP COLUMN "Estado",
DROP COLUMN "IDCliente",
DROP COLUMN "IDTicket",
DROP COLUMN "IDUsuarioAsignado",
DROP COLUMN "Prioridad",
DROP COLUMN "Titulo",
ADD COLUMN     "AssignedUserID" INTEGER,
ADD COLUMN     "ClientID" INTEGER NOT NULL,
ADD COLUMN     "Description" TEXT NOT NULL,
ADD COLUMN     "Priority" TEXT NOT NULL,
ADD COLUMN     "Status" TEXT NOT NULL,
ADD COLUMN     "TicketID" SERIAL NOT NULL,
ADD COLUMN     "Title" TEXT NOT NULL,
ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY ("TicketID");

-- DropTable
DROP TABLE "Cliente";

-- DropTable
DROP TABLE "Rol";

-- DropTable
DROP TABLE "Usuario";

-- DropTable
DROP TABLE "_UsuarioRoles";

-- CreateTable
CREATE TABLE "User" (
    "UserID" SERIAL NOT NULL,
    "Username" TEXT NOT NULL,
    "FirstName" TEXT NOT NULL,
    "LastName" TEXT NOT NULL,
    "Email" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("UserID")
);

-- CreateTable
CREATE TABLE "Role" (
    "RoleID" SERIAL NOT NULL,
    "RoleName" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("RoleID")
);

-- CreateTable
CREATE TABLE "Client" (
    "ClientID" SERIAL NOT NULL,
    "ClientName" TEXT NOT NULL,
    "ContactPerson" TEXT NOT NULL,
    "Email" TEXT NOT NULL,
    "Phone" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("ClientID")
);

-- CreateTable
CREATE TABLE "_UserRoles" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_Username_key" ON "User"("Username");

-- CreateIndex
CREATE UNIQUE INDEX "User_Email_key" ON "User"("Email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_RoleName_key" ON "Role"("RoleName");

-- CreateIndex
CREATE UNIQUE INDEX "_UserRoles_AB_unique" ON "_UserRoles"("A", "B");

-- CreateIndex
CREATE INDEX "_UserRoles_B_index" ON "_UserRoles"("B");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_AssignedUserID_fkey" FOREIGN KEY ("AssignedUserID") REFERENCES "User"("UserID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ClientID_fkey" FOREIGN KEY ("ClientID") REFERENCES "Client"("ClientID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRoles" ADD CONSTRAINT "_UserRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("RoleID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserRoles" ADD CONSTRAINT "_UserRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("UserID") ON DELETE CASCADE ON UPDATE CASCADE;
