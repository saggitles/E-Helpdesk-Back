-- CreateTable
CREATE TABLE "M2MToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "expiry" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "M2MToken_pkey" PRIMARY KEY ("id")
);
