import { loadConfig } from './config.js';
import { runBackup } from './lib/backup.js';

const config = loadConfig();
runBackup(config.dataDir)
  .then((r) => {
    console.log(`Database : ${r.database}`);
    console.log(`Documents: ${r.archive}`);
  })
  .catch((err) => {
    console.error('backup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
