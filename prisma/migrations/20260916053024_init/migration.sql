-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STANDARD', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('ALL', 'OWNER', 'SPECIFIC', 'BLACKLIST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "apiKey" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "planExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "qr" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "lid" TEXT,
    "name" TEXT,
    "notify" TEXT,
    "verifiedName" TEXT,
    "remoteJidAlt" TEXT,
    "profilePic" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "senderJid" TEXT,
    "fromMe" BOOLEAN NOT NULL,
    "keyId" TEXT NOT NULL,
    "pushName" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "mediaUrl" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "subject" TEXT,
    "description" TEXT,
    "ownerJid" TEXT,
    "participants" JSONB,
    "creation" TIMESTAMP(3),
    "restrict" BOOLEAN,
    "announce" BOOLEAN,
    "metadata" JSONB,
    "inviteCode" TEXT,
    "isCommunity" BOOLEAN NOT NULL DEFAULT false,
    "linkedParentJid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoReply" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "isMedia" BOOLEAN NOT NULL DEFAULT false,
    "mediaUrl" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "content" TEXT,
    "mediaUrl" TEXT,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "AuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "botName" TEXT NOT NULL DEFAULT 'WA-AKG Bot',
    "botMode" "AccessMode" NOT NULL DEFAULT 'OWNER',
    "botAllowedJids" JSONB,
    "botBlockedJids" JSONB,
    "autoReplyMode" "AccessMode" NOT NULL DEFAULT 'ALL',
    "autoReplyAllowedJids" JSONB,
    "autoReplyBlockedJids" JSONB,
    "enableSticker" BOOLEAN NOT NULL DEFAULT true,
    "enableVideoSticker" BOOLEAN NOT NULL DEFAULT true,
    "maxStickerDuration" INTEGER NOT NULL DEFAULT 10,
    "enablePing" BOOLEAN NOT NULL DEFAULT true,
    "enableUptime" BOOLEAN NOT NULL DEFAULT true,
    "removeBgApiKey" TEXT,
    "prefix" TEXT NOT NULL DEFAULT '#',
    "antiSpamEnabled" BOOLEAN NOT NULL DEFAULT false,
    "spamLimit" INTEGER NOT NULL DEFAULT 5,
    "spamInterval" INTEGER NOT NULL DEFAULT 10,
    "spamDelayMin" INTEGER NOT NULL DEFAULT 1000,
    "spamDelayMax" INTEGER NOT NULL DEFAULT 3000,
    "antiBanEnabled" BOOLEAN NOT NULL DEFAULT true,
    "antiBanTyping" BOOLEAN NOT NULL DEFAULT true,
    "antiBanReadFirst" BOOLEAN NOT NULL DEFAULT false,
    "antiBanMinDelay" INTEGER NOT NULL DEFAULT 600,
    "antiBanMaxDelay" INTEGER NOT NULL DEFAULT 2500,
    "welcomeMessage" TEXT,
    "autoRead" BOOLEAN NOT NULL DEFAULT false,
    "alwaysOnline" BOOLEAN NOT NULL DEFAULT false,
    "antiLinkMode" TEXT NOT NULL DEFAULT 'OFF',
    "antiLinkAction" TEXT NOT NULL DEFAULT 'DELETE',
    "antiLinkLimit" INTEGER NOT NULL DEFAULT 3,
    "antiLinkScope" TEXT NOT NULL DEFAULT 'ALL',
    "antiLinkGroups" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appName" TEXT NOT NULL DEFAULT 'WhatsApp Panel',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "enableRegistration" BOOLEAN NOT NULL DEFAULT true,
    "klikqrisBaseUrl" TEXT DEFAULT 'https://klikqris.com/api',
    "klikqrisApiKey" TEXT,
    "klikqrisMerchantId" TEXT,
    "klikqrisEnabled" BOOLEAN NOT NULL DEFAULT false,
    "planConfig" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER NOT NULL DEFAULT 0,
    "colorHex" TEXT NOT NULL DEFAULT '#FF0000',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatLabel" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAccess" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoBroadcast" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "targets" JSONB NOT NULL,
    "intervalMin" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "totalAmount" INTEGER,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'klikqris',
    "reference" TEXT,
    "signature" TEXT,
    "qrString" TEXT,
    "qrImageUrl" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionId_key" ON "Session"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_sessionId_jid_key" ON "Contact"("sessionId", "jid");

-- CreateIndex
CREATE INDEX "Message_sessionId_remoteJid_idx" ON "Message"("sessionId", "remoteJid");

-- CreateIndex
CREATE UNIQUE INDEX "Message_sessionId_keyId_key" ON "Message"("sessionId", "keyId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_sessionId_jid_key" ON "Group"("sessionId", "jid");

-- CreateIndex
CREATE UNIQUE INDEX "AuthState_sessionId_key_key" ON "AuthState"("sessionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BotConfig_sessionId_key" ON "BotConfig"("sessionId");

-- CreateIndex
CREATE INDEX "Label_sessionId_idx" ON "Label"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_sessionId_name_key" ON "Label"("sessionId", "name");

-- CreateIndex
CREATE INDEX "ChatLabel_chatJid_idx" ON "ChatLabel"("chatJid");

-- CreateIndex
CREATE INDEX "ChatLabel_labelId_idx" ON "ChatLabel"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatLabel_labelId_chatJid_key" ON "ChatLabel"("labelId", "chatJid");

-- CreateIndex
CREATE INDEX "SessionAccess_userId_idx" ON "SessionAccess"("userId");

-- CreateIndex
CREATE INDEX "SessionAccess_sessionId_idx" ON "SessionAccess"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionAccess_sessionId_userId_key" ON "SessionAccess"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "AutoBroadcast_sessionId_idx" ON "AutoBroadcast"("sessionId");

-- CreateIndex
CREATE INDEX "ApiUsage_userId_month_idx" ON "ApiUsage"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ApiUsage_userId_day_key" ON "ApiUsage"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoReply" ADD CONSTRAINT "AutoReply_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatLabel" ADD CONSTRAINT "ChatLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAccess" ADD CONSTRAINT "SessionAccess_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAccess" ADD CONSTRAINT "SessionAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoBroadcast" ADD CONSTRAINT "AutoBroadcast_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
