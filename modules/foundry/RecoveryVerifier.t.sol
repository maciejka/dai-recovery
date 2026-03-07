// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { RecoveryVerifier } from "./RecoveryVerifier.sol";

interface Vm {
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJson(string calldata json, string calldata key) external pure returns (bytes memory);
}

contract RecoveryVerifierTest {
    address private constant HEVM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm private constant vm = Vm(HEVM_ADDRESS);

    uint256 internal constant SAMPLE_SIZE = 64;
    uint256 internal constant RANDOM_SEED = 0x5eed1234;

    RecoveryVerifier internal verifier;
    bytes32 internal root;

    function setUp() public {
        root = _loadRoot();
        verifier = new RecoveryVerifier(root);
    }

    function testAllAccumulatorAccountsBuildValidProofsAndVerify() public view {
        (bytes32 fixtureRoot, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) =
            _loadFixture();

        require(fixtureRoot == verifier.merkleRoot(), "fixture root mismatch");
        require(accounts.length == amounts.length, "fixture length mismatch");
        require(treeLevels.length > 1, "tree must have at least two levels");

        for (uint256 i = 0; i < accounts.length; i++) {
            bytes32[] memory proof = _createProof(treeLevels, i);
            require(verifier.verify(accounts[i], amounts[i], proof), "generated proof should verify");
        }
    }

    function testWrongAmountsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);

        for (uint256 i = 0; i < sampleCount; i++) {
            bytes32[] memory proof = _createProof(treeLevels, i);
            require(!verifier.verify(accounts[i], amounts[i] + 1, proof), "wrong amount should fail");
        }
    }

    function testWrongAccountsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);

        for (uint256 i = 0; i < sampleCount; i++) {
            bytes32[] memory proof = _createProof(treeLevels, i);
            require(!verifier.verify(_mutateAddress(accounts[i]), amounts[i], proof), "wrong account should fail");
        }
    }

    function testBorrowedProofsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);

        for (uint256 i = 0; i < sampleCount; i++) {
            uint256 otherIndex = (i + 1) % accounts.length;
            bytes32[] memory otherProof = _createProof(treeLevels, otherIndex);
            require(!verifier.verify(accounts[i], amounts[i], otherProof), "borrowed proof should fail");
        }
    }

    function testMutatedProofsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);

        for (uint256 i = 0; i < sampleCount; i++) {
            bytes32[] memory proof = _createProof(treeLevels, i);
            _mutateProofWord(proof, RANDOM_SEED + i);
            require(!verifier.verify(accounts[i], amounts[i], proof), "mutated proof should fail");
        }
    }

    function testTruncatedProofsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);

        for (uint256 i = 0; i < sampleCount; i++) {
            bytes32[] memory proof = _createProof(treeLevels, i);
            bytes32[] memory truncatedProof = new bytes32[](proof.length - 1);

            for (uint256 j = 0; j < truncatedProof.length; j++) {
                truncatedProof[j] = proof[j];
            }

            require(!verifier.verify(accounts[i], amounts[i], truncatedProof), "truncated proof should fail");
        }
    }

    function testExtendedProofsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);

        for (uint256 i = 0; i < sampleCount; i++) {
            bytes32[] memory proof = _createProof(treeLevels, i);
            bytes32[] memory extendedProof = new bytes32[](proof.length + 1);

            for (uint256 j = 0; j < proof.length; j++) {
                extendedProof[j] = proof[j];
            }

            extendedProof[proof.length] = _randomWord(RANDOM_SEED, i, proof.length);
            require(!verifier.verify(accounts[i], amounts[i], extendedProof), "extended proof should fail");
        }
    }

    function testGarbageProofsReturnFalse() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        uint256 sampleCount = _sampleCount(accounts.length);
        uint256 proofLength = treeLevels.length - 1;

        for (uint256 i = 0; i < sampleCount; i++) {
            bytes32[] memory garbageProof = new bytes32[](proofLength);

            for (uint256 j = 0; j < proofLength; j++) {
                garbageProof[j] = _randomWord(RANDOM_SEED ^ 0x0badf00d, i, j);
            }

            require(!verifier.verify(accounts[i], amounts[i], garbageProof), "garbage proof should fail");
        }
    }

    function testRootRemainsImmutableAfterVerification() public view {
        (, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels) = _loadFixture();
        bytes32 beforeRoot = verifier.merkleRoot();

        verifier.verify(accounts[0], amounts[0], _createProof(treeLevels, 0));

        require(beforeRoot == root, "constructor root mismatch");
        require(verifier.merkleRoot() == root, "root changed after verification");
    }

    function _accumulatorPath() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/../../data/accumulator.json");
    }

    function _loadRoot() internal view returns (bytes32) {
        string memory json = vm.readFile(_accumulatorPath());
        return abi.decode(vm.parseJson(json, ".merkle.root"), (bytes32));
    }

    function _loadFixture()
        internal
        view
        returns (bytes32 fixtureRoot, address[] memory accounts, uint256[] memory amounts, bytes32[][] memory treeLevels)
    {
        string memory json = vm.readFile(_accumulatorPath());
        fixtureRoot = abi.decode(vm.parseJson(json, ".merkle.root"), (bytes32));
        accounts = abi.decode(vm.parseJson(json, ".claims.addresses"), (address[]));
        treeLevels = abi.decode(vm.parseJson(json, ".merkle.treeLevels"), (bytes32[][]));

        string[] memory amountStrings = abi.decode(vm.parseJson(json, ".claims.amounts"), (string[]));
        amounts = new uint256[](amountStrings.length);
        for (uint256 i = 0; i < amountStrings.length; i++) {
            amounts[i] = _parseUint(amountStrings[i]);
        }
    }

    function _createProof(bytes32[][] memory treeLevels, uint256 leafIndex)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        require(treeLevels.length > 1, "tree must have proof levels");
        require(leafIndex < treeLevels[0].length, "leaf index out of bounds");

        proof = new bytes32[](treeLevels.length - 1);
        uint256 currentIndex = leafIndex;

        for (uint256 levelIndex = 0; levelIndex < treeLevels.length - 1; levelIndex++) {
            bytes32[] memory level = treeLevels[levelIndex];
            uint256 siblingIndex = currentIndex % 2 == 0 ? currentIndex + 1 : currentIndex - 1;

            if (siblingIndex >= level.length) {
                siblingIndex = currentIndex;
            }

            proof[levelIndex] = level[siblingIndex];
            currentIndex /= 2;
        }
    }

    function _mutateAddress(address account) internal pure returns (address) {
        return address(uint160(account) ^ uint160(1));
    }

    function _mutateProofWord(bytes32[] memory proof, uint256 seed) internal pure {
        uint256 proofIndex = seed % proof.length;
        uint256 bitIndex = (seed / proof.length) % 256;
        proof[proofIndex] = bytes32(uint256(proof[proofIndex]) ^ (uint256(1) << bitIndex));
    }

    function _randomWord(uint256 seed, uint256 claimIndex, uint256 proofIndex) internal pure returns (bytes32) {
        return keccak256(abi.encode(seed, claimIndex, proofIndex));
    }

    function _parseUint(string memory value) internal pure returns (uint256 result) {
        bytes memory raw = bytes(value);
        require(raw.length > 0, "empty uint string");

        for (uint256 i = 0; i < raw.length; i++) {
            uint8 charCode = uint8(raw[i]);
            require(charCode >= 48 && charCode <= 57, "invalid uint digit");
            result = (result * 10) + (charCode - 48);
        }
    }

    function _sampleCount(uint256 length) internal pure returns (uint256) {
        return length < SAMPLE_SIZE ? length : SAMPLE_SIZE;
    }
}
