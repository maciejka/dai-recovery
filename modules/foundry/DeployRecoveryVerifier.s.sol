// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { RecoveryVerifier } from "./RecoveryVerifier.sol";

interface Vm {
    function envBytes32(
        string calldata key
    ) external returns (bytes32);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployRecoveryVerifier {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (RecoveryVerifier deployed) {
        bytes32 root = vm.envBytes32("MERKLE_ROOT");
        vm.startBroadcast();
        deployed = new RecoveryVerifier(root);
        vm.stopBroadcast();
    }
}
