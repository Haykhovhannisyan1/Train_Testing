//                                                                                       ......
//             ....                                                                      .......
//             .....                                                                     .......
//             .....                                                                      ....
//             .....
//             .....
//             .....               ...        .......            .......                   ...        ...         .....
//       ...................      .....  .............      ..................            .....      .....  .................
//       ...................      ....................   .......................          .....      ..........................
//       ...................      ............          ............ .............        .....      ..............  ............
//             .....              ........            ........             ........       .....      ........              .......
//             .....              ......              ......                 .......      .....      .......                .......
//             .....              ......             ......                    .....      .....      ......                  ......
//             .....              .....             ......                     ......     .....      .....                    .....
//             .....              .....             .....                       .....     .....      .....                    .....
//             .....              .....             .....                       .....     .....      .....                    .....
//             .....              .....             .....                       .....     .....      .....                    .....
//             .....              .....             ......                      .....     .....      .....                    .....
//             .....              .....              ......                    ......     .....      .....                    .....
//             .....              .....              .......                 ........     .....      .....                    .....
//             .......            .....               ........              .........     .....      .....                    .....
//              .............     .....                .........         ............     .....      .....                    .....
//               .............    .....                  ...................... .....     .....      .....                    .....
//                 ...........    .....                     .................   .....     .....      .....                    .....
//                     ......      ...                           ........        ...       ...        ...                      ...

// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

/// @title Train Contract
/// @notice Implements the Train protocol for ERC20 tokens, enabling secure and atomic cross-chain swaps.
/// @dev Manages HTLCs for ERC20 tokens with event-driven updates.

contract TrainERC20 is ReentrancyGuard, EIP712 {
  using ECDSA for bytes32;

  constructor() EIP712('Train', '1') {}

  /// @dev Custom errors to simplify failure handling in the contract.
  error FundsNotSent();
  error NotPassedTimelock();
  error HTLCAlreadyExists();
  error HTLCNotExists();
  error HashlockNotMatch();
  error AlreadyClaimed();
  error NoAllowance();
  error InvalidSignature();
  error HashlockAlreadySet();
  error InsufficientBalance();
  error InvalidTimelock();
  error InvaliRewardTimelock();

  /// @dev Represents a hashed time-locked contract (HTLC) for ERC20 tokens.
  struct HTLC {
    /// @notice The amount of ERC20 tokens locked in the HTLC.
    uint256 amount;
    /// @notice The hash of the secret required for redemption.
    bytes32 hashlock;
    /// @notice The secret required to redeem.
    uint256 secret;
    /// @notice The ERC20 token contract address.
    address tokenContract;
    /// @notice The timestamp after which the funds can be refunded.
    uint48 timelock;
    /// @notice Indicates whether the funds were claimed (redeemed(3) or refunded(2)).
    uint8 claimed;
    /// @notice The creator of the HTLC.
    address payable sender;
    /// @notice The recipient of the funds if conditions are met.
    address payable srcReceiver;
  }

  /// @dev Represents the details required to add a lock, used as part of the `addLockSig` parameters.
  struct addLockMsg {
    /// @notice The identifier of the HTLC to which the hashlock should be added and the timelock updated.
    bytes32 Id;
    /// @notice The hashlock to be added to the HTLC.
    bytes32 hashlock;
    /// @notice The new timelock to be set for the HTLC.
    uint48 timelock;
  }

  /// @dev Represents the reward details including the amount and the timelock for claiming the reward.
  struct Reward {
    /// @notice The amount of the reward in ERC20 token to be claimed.
    uint256 amount;
    /// @notice The timelock (timestamp) after which the reward can be claimed.
    uint48 timelock;
  }

  /// @dev Represents the parameters required to call lock function
  struct lockCallParams {
    /// @notice The unique identifier for the HTLC.
    bytes32 Id;
    /// @notice The hash of the secret that must be provided to redeem the locked tokens.
    bytes32 hashlock;
    /// @notice The reward amount in ERC20 tokens granted to the caller of `redeem`.
    uint256 reward;
    /// @notice The timestamp after which the reward can be claimed.
    uint48 rewardTimelock;
    /// @notice The timestamp after which the locked funds can be refunded if not redeemed.
    uint48 timelock;
    /// @notice The recipient address that will receive the locked funds upon successful redemption.
    address srcReceiver;
    /// @notice The asset being locked in the HTLC.
    string srcAsset;
    /// @notice The name of the destination blockchain where the swap will be completed.
    string dstChain;
    /// @notice The recipient address on the destination chain that will receive the swapped asset.
    string dstAddress;
    /// @notice The asset on the destination chain that will be received upon successful swap.
    string dstAsset;
    /// @notice The amount of ERC20 tokens to be locked in the HTLC.
    uint256 amount;
    /// @notice The contract address of the ERC20 token being locked.
    address tokenContract;
  }

  using SafeERC20 for IERC20;

  /// @dev Storage for HTLCs
  mapping(bytes32 => HTLC) private contracts;
  /// @dev Storage for rewards on unclaimed HTLCs
  mapping(bytes32 => Reward) private rewards;

  /// @dev Emitted when an HTLC is created and ERC20 tokens are committed.
  /// @param Id The unique identifier of the HTLC.
  /// @param hopChains The sequence of chains forming the path from the source to the destination chain.
  /// @param hopAssets The sequence of assets being swapped along the path.
  /// @param hopAddresses The sequence of addresses involved along the path.
  /// @param dstChain The destination blockchain.
  /// @param dstAddress The recipient address on the destination chain.
  /// @param dstAsset The asset on the destination chain.
  /// @param sender The creator of the HTLC.
  /// @param srcReceiver The recipient of the funds if conditions are met.
  /// @param srcAsset The asset being locked.
  /// @param amount The amount of ERC20 tokens locked in the HTLC.
  /// @param timelock The timestamp after which the funds can be refunded.
  /// @param tokenContract The address of the ERC20 token contract.
  event TokenCommitted(
    bytes32 indexed Id,
    string[] hopChains,
    string[] hopAssets,
    string[] hopAddresses,
    string dstChain,
    string dstAddress,
    string dstAsset,
    address indexed sender,
    address indexed srcReceiver,
    string srcAsset,
    uint256 amount,
    uint48 timelock,
    address tokenContract
  );

  /// @dev Emitted when an HTLC is locked with a hashlock and timelock.
  /// @param reward The reward amount (in ERC20 token) associated with the HTLC.
  /// @param rewardTimelock The timelock (timestamp) after which the reward can be claimed.
  event TokenLocked(
    bytes32 indexed Id,
    bytes32 hashlock,
    string dstChain,
    string dstAddress,
    string dstAsset,
    address indexed sender,
    address indexed srcReceiver,
    string srcAsset,
    uint256 amount,
    uint256 reward,
    uint48 rewardTimelock,
    uint48 timelock,
    address tokenContract
  );

  /// @dev Emitted when a hashlock and timelock are added to an existing HTLC.
  event TokenLockAdded(bytes32 indexed Id, bytes32 hashlock, uint48 timelock);

  /// @dev Emitted when funds are redeemed from an HTLC using the correct secret.
  event TokenRedeemed(bytes32 indexed Id, address redeemAddress, uint256 secret, bytes32 hashlock);

  /// @dev Emitted when funds are redeemed from an HTLC using the correct secret.
  event TokenRefunded(bytes32 indexed Id);

  /// @dev Modifier to ensure HTLC exists before proceeding.
  modifier _exists(bytes32 Id) {
    if (!hasHTLC(Id)) revert HTLCNotExists();
    _;
  }

  /// @dev Modifier to ensure the provided timelock is at least 15 minutes in the future.
  modifier _validTimelock(uint48 timelock) {
    if (block.timestamp + 900 > timelock) revert InvalidTimelock();
    _;
  }

  /// @notice Creates and commits a new hashed time-locked contract (HTLC) for ERC20 tokens.
  /// @dev Transfers the specified amount of ERC20 tokens to the contract and emits a `TokenCommitted` event.
  /// @param hopChains The sequence of chains forming the path from the source to the destination chain.
  /// @param hopAssets The sequence of assets being swapped along the path.
  /// @param hopAddresses The sequence of addresses involved along the path.
  /// @param dstChain The destination blockchain.
  /// @param dstAsset The asset on the destination chain.
  /// @param dstAddress The recipient address on the destination chain.
  /// @param srcAsset The asset being locked.
  /// @param Id The unique identifier of the created HTLC.
  /// @param srcReceiver The recipient of the funds if conditions are met.
  /// @param timelock The timestamp after which the funds can be refunded.
  /// @param amount The amount of ERC20 tokens to lock in the HTLC.
  /// @param tokenContract The address of the ERC20 token contract.
  /// @return bytes32 The unique identifier of the created HTLC.
  function commit(
    string[] calldata hopChains,
    string[] calldata hopAssets,
    string[] calldata hopAddresses,
    string calldata dstChain,
    string calldata dstAsset,
    string calldata dstAddress,
    string calldata srcAsset,
    bytes32 Id,
    address srcReceiver,
    uint48 timelock,
    uint256 amount,
    address tokenContract
  ) external _validTimelock(timelock) nonReentrant returns (bytes32) {
    // Ensure the generated ID does not already exist to prevent overwriting.
    if (hasHTLC(Id)) revert HTLCAlreadyExists();
    IERC20 token = IERC20(tokenContract);

    if (token.balanceOf(msg.sender) < amount) revert InsufficientBalance();
    if (token.allowance(msg.sender, address(this)) < amount) revert NoAllowance();
    uint256 contractBalance = token.balanceOf(address(this));
    token.safeTransferFrom(msg.sender, address(this), amount);
    contractBalance = token.balanceOf(address(this)) - contractBalance;
    if (contractBalance != amount || amount == 0) revert FundsNotSent(); // Ensure funds are sent.

    // Store HTLC details.
    contracts[Id] = HTLC(
      contractBalance,
      bytes32(bytes1(0x01)),
      uint256(1),
      tokenContract,
      timelock,
      uint8(1),
      payable(msg.sender),
      payable(srcReceiver)
    );

    // Emit the commit event.
    emit TokenCommitted(
      Id,
      hopChains,
      hopAssets,
      hopAddresses,
      dstChain,
      dstAddress,
      dstAsset,
      msg.sender,
      srcReceiver,
      srcAsset,
      contractBalance,
      timelock,
      tokenContract
    );
    return Id;
  }

  /// @notice Adds a hashlock and updates the timelock for an existing HTLC.
  /// @dev Can only be called by the HTLC's creator if the HTLC exists and has not been claimed. Emits a `TokenLockAdded` event.
  /// @param Id The unique identifier of the HTLC to update.
  /// @param hashlock The hashlock to be added.
  /// @param timelock The new timelock to be set.
  /// @return bytes32 The updated HTLC identifier.
  function addLock(
    bytes32 Id,
    bytes32 hashlock,
    uint48 timelock
  ) external _exists(Id) _validTimelock(timelock) nonReentrant returns (bytes32) {
    HTLC storage htlc = contracts[Id];
    if (htlc.claimed == 2 || htlc.claimed == 3) revert AlreadyClaimed();
    if (msg.sender == htlc.sender) {
      if (htlc.hashlock == bytes32(bytes1(0x01))) {
        htlc.hashlock = hashlock;
        htlc.timelock = timelock;
      } else {
        revert HashlockAlreadySet(); // Prevent overwriting hashlock.
      }
      emit TokenLockAdded(Id, hashlock, timelock);
      return Id;
    } else {
      revert NoAllowance(); // Ensure only allowed accounts can add a lock.
    }
  }

  /// @notice Adds a hashlock and updates the timelock for an existing HTLC using a signed message.
  /// @dev Verifies the provided signature and updates the HTLC if valid. Emits a `TokenLockAdded` event.
  /// @param message The details of the lock to be added, including the HTLC ID, hashlock, and timelock.
  /// @param r The `r` value of the ECDSA signature.
  /// @param s The `s` value of the ECDSA signature.
  /// @param v The `v` value of the ECDSA signature.
  /// @return bytes32 The updated HTLC identifier.
  function addLockSig(
    addLockMsg calldata message,
    bytes32 r,
    bytes32 s,
    uint8 v
  ) external _exists(message.Id) _validTimelock(message.timelock) nonReentrant returns (bytes32) {
    HTLC storage htlc = contracts[message.Id];
    bool verified = false;
    if (htlc.sender.code.length == 0) {
      verified = verifyMessage(message, r, s, v);
    } else {
      bytes memory signature = abi.encodePacked(r, s, v);
      bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _domainSeparatorV4(), hashMessage(message)));
      verified = SignatureChecker.isValidERC1271SignatureNow(htlc.sender, digest, signature);
    }

    if (!verified) revert InvalidSignature();
    if (htlc.claimed == 2 || htlc.claimed == 3) revert AlreadyClaimed();
    if (htlc.hashlock == bytes32(bytes1(0x01))) {
      htlc.hashlock = message.hashlock;
      htlc.timelock = message.timelock;
    } else {
      revert HashlockAlreadySet();
    }
    emit TokenLockAdded(message.Id, message.hashlock, message.timelock);
    return message.Id;
  }

  /// @notice Locks ERC20 tokens in a new hashed time-locked contract (HTLC).
  /// @dev Transfers the specified amount of ERC20 tokens to the contract and emits a `TokenLocked` event.
  /// @param params Struct containing all lock parameters.
  /// @return bytes32 The unique identifier of the created HTLC.
  function lock(lockCallParams memory params) external nonReentrant returns (bytes32) {
    if (hasHTLC(params.Id)) revert HTLCAlreadyExists();
    if (block.timestamp + 1800 > params.timelock) revert InvalidTimelock();
    if (params.rewardTimelock > params.timelock || params.rewardTimelock <= block.timestamp)
      revert InvaliRewardTimelock();
    IERC20 token = IERC20(params.tokenContract);

    if (token.balanceOf(msg.sender) < params.amount + params.reward) revert InsufficientBalance();
    if (token.allowance(msg.sender, address(this)) < params.amount + params.reward) revert NoAllowance();
    uint256 contractBalance = token.balanceOf(address(this));
    token.safeTransferFrom(msg.sender, address(this), params.amount + params.reward);
    contractBalance = token.balanceOf(address(this)) - contractBalance;

    if (contractBalance != params.amount + params.reward || params.amount == 0) revert FundsNotSent();

    contracts[params.Id] = HTLC(
      params.amount,
      params.hashlock,
      uint256(1),
      params.tokenContract,
      params.timelock,
      uint8(1),
      payable(msg.sender),
      payable(params.srcReceiver)
    );

    if (params.reward != 0) {
      rewards[params.Id] = Reward(params.reward, params.rewardTimelock);
    }

    emit TokenLocked(
      params.Id,
      params.hashlock,
      params.dstChain,
      params.dstAddress,
      params.dstAsset,
      msg.sender,
      params.srcReceiver,
      params.srcAsset,
      params.amount,
      params.reward,
      params.rewardTimelock,
      params.timelock,
      params.tokenContract
    );
    return params.Id;
  }

  /// @notice Redeems funds from an HTLC using the correct secret.
  /// @dev Verifies the provided secret against the hashlock and transfers the funds to the recipient. Emits a `TokenRedeemed` event.
  /// @param Id The unique identifier of the HTLC to be redeemed.
  /// @param secret The secret value used to unlock the HTLC.
  /// @return bool Returns `true` if the redemption is successful.
  function redeem(bytes32 Id, uint256 secret) external _exists(Id) nonReentrant returns (bool) {
    HTLC storage htlc = contracts[Id];

    if (htlc.hashlock != sha256(abi.encodePacked(secret))) revert HashlockNotMatch(); // Ensure secret matches hashlock.
    if (htlc.claimed == 3 || htlc.claimed == 2) revert AlreadyClaimed();

    htlc.claimed = 3;
    htlc.secret = secret;
    Reward storage reward = rewards[Id];

    if (reward.amount == 0) {
      IERC20(htlc.tokenContract).safeTransfer(htlc.srcReceiver, htlc.amount);
    } else if (reward.timelock > block.timestamp) {
      IERC20(htlc.tokenContract).safeTransfer(htlc.srcReceiver, htlc.amount);
      IERC20(htlc.tokenContract).safeTransfer(htlc.sender, reward.amount);
    } else {
      if (msg.sender == htlc.srcReceiver) {
        IERC20(htlc.tokenContract).safeTransfer(htlc.srcReceiver, htlc.amount + reward.amount);
      } else {
        IERC20(htlc.tokenContract).safeTransfer(htlc.srcReceiver, htlc.amount);
        IERC20(htlc.tokenContract).safeTransfer(msg.sender, reward.amount);
      }
    }
    emit TokenRedeemed(Id, msg.sender, secret, htlc.hashlock);
    return true;
  }

  /// @notice Refunds the locked funds from an HTLC after the timelock expires.
  /// @dev Can only be called if the HTLC exists and the timelock has passed. Emits a `TokenRefunded` event.
  /// @param Id The unique identifier of the HTLC to be refunded.
  /// @return bool Returns `true` if the refund is successful.
  function refund(bytes32 Id) external _exists(Id) nonReentrant returns (bool) {
    HTLC storage htlc = contracts[Id];
    if (htlc.claimed == 2 || htlc.claimed == 3) revert AlreadyClaimed(); // Prevent refund if already redeemed or refunded.
    if (htlc.timelock > block.timestamp) revert NotPassedTimelock(); // Ensure timelock has passed.

    htlc.claimed = 2;
    if (rewards[Id].amount != 0) {
      IERC20(htlc.tokenContract).safeTransfer(htlc.sender, htlc.amount + rewards[Id].amount);
    } else {
      IERC20(htlc.tokenContract).safeTransfer(htlc.sender, htlc.amount);
    }
    emit TokenRefunded(Id);
    return true;
  }

  /// @notice Retrieves the details of a specific HTLC.
  /// @dev Returns the HTLC structure associated with the given identifier.
  /// @param Id The unique identifier of the HTLC.
  /// @return HTLC The details of the specified HTLC.
  function getHTLCDetails(bytes32 Id) public view returns (HTLC memory) {
    return contracts[Id];
  }

  /// @notice Fetches the reward details for a specific HTLC.
  /// @dev Returns the reward amount (in ERC20 token) and the timelock after which it can be claimed.
  /// @param Id The unique identifier of the HTLC.
  /// @return Reward A struct with the reward amount and claimable timelock.
  function getRewardDetails(bytes32 Id) public view returns (Reward memory) {
    return rewards[Id];
  }

  /// @notice Generates a hash of the `addLockMsg` structure.
  /// @dev Encodes and hashes the `addLockMsg` fields for use in EIP-712 signature verification.
  /// @param message The `addLockMsg` structure containing the HTLC details to be hashed.
  /// @return bytes32 The hashed representation of the `addLockMsg` structure.
  function hashMessage(addLockMsg calldata message) private pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          keccak256('addLockMsg(bytes32 Id,bytes32 hashlock,uint48 timelock)'),
          message.Id,
          message.hashlock,
          message.timelock
        )
      );
  }

  /// @notice Verifies that an EIP-712 message signature matches the sender of the specified HTLC.
  /// @dev Combines the domain separator and the hashed message to create the digest, then verifies the signature.
  /// @param message The `addLockMsg` structure containing the HTLC details.
  /// @param r The `r` value of the ECDSA signature.
  /// @param s The `s` value of the ECDSA signature.
  /// @param v The `v` value of the ECDSA signature.
  /// @return bool Returns `true` if the signature is valid and matches the sender of the HTLC.
  function verifyMessage(addLockMsg calldata message, bytes32 r, bytes32 s, uint8 v) private view returns (bool) {
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _domainSeparatorV4(), hashMessage(message)));
    return (ECDSA.recover(digest, v, r, s) == contracts[message.Id].sender);
  }

  /// @notice Checks whether an HTLC with the given Id exists.
  /// @dev An HTLC exists if the sender address in its details is non-zero.
  /// @param Id The unique identifier of the HTLC to check.
  /// @return Returns `true` if the HTLC exists, otherwise `false`.
  function hasHTLC(bytes32 Id) private view returns (bool) {
    return (contracts[Id].sender != address(0));
  }
}
