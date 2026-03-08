import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Hex = `0x${string}`;

interface AccumulatorFile {
  merkle: {
    root: Hex;
    treeLevels: Hex[][];
  };
  claims: {
    addresses: string[];
    amounts: string[];
  };
}

interface FixtureClaim {
  address: string;
  amount: string;
  proof: Hex[];
}

const SAMPLE_SIZE = 4;

function createProof(treeLevels: Hex[][], leafIndex: number): Hex[] {
  const proof: Hex[] = [];
  let currentIndex = leafIndex;

  for (let levelIndex = 0; levelIndex < treeLevels.length - 1; levelIndex += 1) {
    const level = treeLevels[levelIndex];
    let siblingIndex =
      currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    if (siblingIndex >= level.length) {
      siblingIndex = currentIndex;
    }

    proof.push(level[siblingIndex]);
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

function renderStringList(values: string[], indent: string): string {
  if (values.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...values.map((value, index) => {
      const suffix = index === values.length - 1 ? "" : ",";
      return `${indent}"${value}"${suffix}`;
    }),
    `${indent.slice(2)}]`,
  ].join("\n");
}

function renderClaims(claims: FixtureClaim[]): string {
  if (claims.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...claims.flatMap((claim, index) => {
      const prefix = index === claims.length - 1 ? "" : ",";
      return [
        "  {",
        `    address := "${claim.address}"`,
        `    amount := "${claim.amount}"`,
        `    proof := ${renderStringList(claim.proof, "      ")}`,
        `  }${prefix}`,
      ];
    }),
    "]",
  ].join("\n");
}

async function main(): Promise<void> {
  const projectRoot = resolve(import.meta.dir, "../../..");
  const accumulatorPath = resolve(projectRoot, "data/accumulator.json");
  const outputPath = resolve(
    projectRoot,
    "formal/lean/DaiRecoveryFormal/Fixtures.lean",
  );

  const accumulatorText = await readFile(accumulatorPath, "utf8");
  const accumulator = JSON.parse(accumulatorText) as AccumulatorFile;

  const sampleClaims: FixtureClaim[] = accumulator.claims.addresses
    .slice(0, SAMPLE_SIZE)
    .map((address, index) => ({
      address,
      amount: accumulator.claims.amounts[index],
      proof: createProof(accumulator.merkle.treeLevels, index),
    }));

  const output = `import Mathlib

set_option autoImplicit false

namespace DaiRecoveryFormal

namespace Fixtures

structure FixtureClaim where
  address : String
  amount : String
  proof : List String
deriving Repr

def sampleRoot : String := "${accumulator.merkle.root}"

def sampleClaims : List FixtureClaim :=
${renderClaims(sampleClaims)}

end Fixtures

end DaiRecoveryFormal
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}

await main();
