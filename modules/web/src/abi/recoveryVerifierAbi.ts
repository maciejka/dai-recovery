export const recoveryVerifierAbi = [
  {
    type: 'function',
    name: 'verify',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
