import { resolve } from 'node:path';
import { buildAndWriteArtifacts } from '../src/accumulator';

const INPUT_PATH = resolve(process.cwd(), 'data/transfers.json');
const OUTPUT_DIR = resolve(process.cwd(), 'data');

async function main() {
  const result = await buildAndWriteArtifacts({
    inputPath: INPUT_PATH,
    outputDir: OUTPUT_DIR,
  });

  console.log(`Merkle root: ${result.merkleRoot}`);
  console.log(`Claims: ${result.claimsCount}`);
  console.log(
    `Rows: total=${result.stats.totalRows}, included=${result.stats.includedRows}, zero_filtered=${result.stats.excludedZeroAmountRows}`,
  );
  console.log(`Artifacts written to ${result.outputDir}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
