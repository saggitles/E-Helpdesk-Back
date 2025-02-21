/*
  Warnings:

  - Made the column `Username` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `FirstName` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `LastName` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `Email` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "Username" SET NOT NULL,
ALTER COLUMN "FirstName" SET NOT NULL,
ALTER COLUMN "LastName" SET NOT NULL,
ALTER COLUMN "Email" SET NOT NULL;
