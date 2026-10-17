-- CreateEnum
CREATE TYPE "AttendanceAnswer" AS ENUM ('YES', 'NO');

-- AlterTable
ALTER TABLE "PersonEvent" ADD COLUMN     "attendanceAnswer" "AttendanceAnswer",
ADD COLUMN     "attendanceAnsweredAt" TIMESTAMP(3);
