import { loadConfig, createLogFilePath } from '../config';
import { createLogger } from '../logging/logger';
import { runAutoInquiry } from '../workflow/autoInquiryRunner';

export async function runAutoInquiryCli(): Promise<void> {
  const config = loadConfig();
  const logFile = createLogFilePath();
  const logger = createLogger({ logFile });

  try {
    await runAutoInquiry(config, logger, logFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`致命的なエラーが発生しました: ${message}`);
    throw error;
  }
}

if (require.main === module) {
  runAutoInquiryCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
