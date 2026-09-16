-- CreateEnum
CREATE TYPE "CloudStorageProvider" AS ENUM ('GOOGLE_DRIVE', 'AWS_S3', 'CLOUDINARY', 'WEBDAV');

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "allowLocalStorage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowLocalStorageFor" JSONB;

-- CreateTable
CREATE TABLE "CloudStorageConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CloudStorageProvider" NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Cloud Storage',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "credentials" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudStorageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CloudStorageConfig_userId_idx" ON "CloudStorageConfig"("userId");

-- AddForeignKey
ALTER TABLE "CloudStorageConfig" ADD CONSTRAINT "CloudStorageConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
