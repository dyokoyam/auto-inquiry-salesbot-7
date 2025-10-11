import { runAutoInquiryCli } from '../src/cli/runAutoInquiry';

runAutoInquiryCli().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
