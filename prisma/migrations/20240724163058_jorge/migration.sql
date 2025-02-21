-- CreateTable
CREATE TABLE "GuestTicket" (
    "IDGuestTicket" SERIAL NOT NULL,
    "yourName" TEXT NOT NULL,
    "yourEmail" TEXT NOT NULL,
    "vehicleIdOrDriverName" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "issueTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestTicket_pkey" PRIMARY KEY ("IDGuestTicket")
);
