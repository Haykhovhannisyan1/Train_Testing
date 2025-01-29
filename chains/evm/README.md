# Train Contract

## Overview

The **Train Contract** enables secure, atomic cross-chain swaps.

## Features

- **Secure Swaps**: Trustless cross-chain transactions.
- **EIP-712 Signatures**: Off-chain message verification.
- **Event-Based Tracking**: Real-time updates.
- **Timelock & Hashlock**: Ensures safe fund handling.

## Functions

- **commit(...)** - Lock funds.
- **lock(...)** - Lock funds with a hashlock.
- **addLock(...)** - Update an HTLC with a new hashlock and timelock.
- **addLockSig(...)** - Add a hashlock using a signed message.
- **redeem(Id, secret)** - Claim funds with a secret.
- **refund(Id)** - Reclaim expired funds.

## Events

- `TokenCommitted`: Funds locked.
- `TokenLocked`: Hashlock added.
- `TokenLockAdded`: Additional lock applied.
- `TokenRedeemed`: Swap completed.
- `TokenRefunded`: Funds refunded.

## Usage

Deploy with Solidity `0.8.23` and OpenZeppelin. Use Hardhat, Foundry, or Remix.

## Security

- Use **secure hash functions** (`sha256`).
- Set **appropriate timelock durations**.
- Sign off-chain messages with **secure private keys**.

## License

Released under **MIT License**.
