/*
  Warnings:

  - The `RoleName` column on the `UserRole` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "UserRole" DROP COLUMN "RoleName",
ADD COLUMN     "RoleName" TEXT[];
