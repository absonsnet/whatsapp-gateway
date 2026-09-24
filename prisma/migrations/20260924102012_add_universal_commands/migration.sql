-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "universalCommands" JSONB;

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "description" TEXT DEFAULT 'WhatsApp Gateway & Management Dashboard';
