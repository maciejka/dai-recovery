// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RecoveryVerifier {
    bytes32 public immutable merkleRoot;

    constructor(
        bytes32 root_
    ) {
        merkleRoot = root_;
    }

    function verify(
        address account,
        uint256 totalAmount,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encode(account, totalAmount));
        return _verify(proof, merkleRoot, leaf);
    }

    // OpenZeppelin-compatible sorted-pair Merkle proof verification.
    function _verify(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        return _processProof(proof, leaf) == root;
    }

    function _processProof(
        bytes32[] calldata proof,
        bytes32 leaf
    ) internal pure returns (bytes32) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = _hashPair(computedHash, proof[i]);
        }
        return computedHash;
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? _efficientHash(a, b) : _efficientHash(b, a);
    }

    function _efficientHash(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, b));
    }
}
