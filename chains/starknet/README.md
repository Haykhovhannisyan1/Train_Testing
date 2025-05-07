# Disclaimer: Development in Progress

Please note that this project is actively under development. It is not ready for deployment on any mainnet environments.
As we continue to experiment and test new ideas, expect significant changes to the interface. Please be prepared for ongoing modifications.

# Hashed Timelock Contracts (HTLCs)

This part of the repository contains a cairo1.0 smart contract for implementing Hashed Timelock Contracts (HTLCs) on Starknet. This contract enables users to create, manage, and interact with HTLCs, facilitating secure and trustless transactions. The contract includes functions such as creating new HTLCs, redeeming funds locked in HTLCs with a secret hash, and refunding funds in case of expiration or non-redeem. Users can refer to the contract source code and documentation for detailed information on each function's usage and parameters.

## Contract Overview

### HashedTimelockERC20.cairo

**Description**: This contract allows users to create HTLCs for Starknet. It follows a protocol where a sender can create a new HTLC for a specific ERC20 token, a receiver can claim the ERC20 after revealing the secret, and the sender can refund the ERC20 if the time lock expires.

#### Functions

- **commit**: Allows a sender to create a new PreHTLC for EREC20 tokens by specifying the receiver, messenger, timelock, token contract, and amount.
- **lock**: Allows a sender to create a new HTLC for EREC20 tokens by specifying the receiver, hashlock, timelock, token contract, and amount.
- **redeem**: Allows the receiver to claim the EREC20 tokens locked in the HTLC by providing the secret hash.
- **addLock**: Allows the messenger to lock the commited funds by the given hashlock.
- **unlock**: Allows the sender to unlock the EREC20 tokens if the timelock expires and the receiver has not redeemed the funds.
- **getDetails**: Retrieves details of a specific HTLC/PreHTLC by its contract ID.



## Deployment

### Prerequisites

- starkli and scarb installed
- Starknet network connection (e.g., localhost, sepolia, etc.)
- Ether or test tokens for deployment gas fees

### Steps

1. Clone this repository:

   ```bash
   git clone <repository_url>

2. Navigate to the project directory:

    ```bash
    cd <project_directory>

3. Create a signer:

    ```bash
    mkdir -p ~/.starkli-wallets/deployer

4. Set up your wallet:

    ```bash
    starkli signer keystore from-key ~/.starkli-wallets/deployer/my_keystore_1.json
    starkli account fetch <SMART_WALLET_ADDRESS> --output ~/.starkli-wallets/deployer/my_account_1.json --rpc <Alchemy_Startknet_URL>

5. Set Env Variables:

    ```bash
    export STARKNET_ACCOUNT=~/.starkli-wallets/deployer/my_account_1.json
    export STARKNET_KEYSTORE=~/.starkli-wallets/deployer/my_keystore_1.json
    export STARKNET_RPC=<Alchemy_Startknet_URL>

6. Build Contract:

   ```bash
   scarb build
   
7. Declarse class hash
    ```bash
    starkli declare ./target/dev/<YOUR_FILE_NAME>.contract_class.json

8. Deploy the contracts:

    ```bash
    starkli deploy <YOUR_CLASS_HASH>

## Tests

There are 12 test types for the HTLC contract which are written in the tests folder.
The 12 tests types are 
    ```bash
    0. Tests with not existing HTLCs (Can't call any of the functions if the HTLC with that Id does not exist).
    1. Tests for redeeming HTLC (Can redeem with correct secret, and can't redeem with wrong secret).
    2. Tests for already redeemed HTLCs (Can't call any of the functions if the HTLC with that Id is already redeemed).
    3. Tests for refunding HTLC (Can refund if the timelock passed, and can't refund if timelock did not pass yet).
    4. Tests for already refunded HTLCs (Can't call any of the functions if the HTLC with that Id is already refunded).
    5. Tests for already created (Pre)HTLCs (Can't create Pre(HTLC)s with already existing Id).
    6. Tests for not positive amount (Pre)HTLCs (Can't create Pre(HTLC) with not positive amount).
    7. Tests for (Pre)HTLCs without enough balance (Can't create Pre(HTLC) without enough balance).
    8. Tests for (Pre)HTLCs without enough allowance (Can't create Pre(HTLC) without enough allowance).
    9. Tests for (Pre)HTLCs with wrong timelocks (Can't create Pre(HTLC) with wrong timelock).
    10. Tests for HTLCs with wrong reward timelocks (Can't create HTLC with not future reward timelock, or with bigger reward timelock).
    11. Tests for add Lock function (Sender can add lock to PreHTLC, other users can't add lock to PreHTLC, can't add lock if hashlock is already set, and can't add lock with wrong timelock).
    12. Tests for add Lock signature function (Can add lock with correct signature, can't add lock signature if hashlock is already set, can't add lock with wrong data, and can't add lock signed by other user).

Usage
Once deployed, users can interact with the contracts using Starknet wallets or through contract function calls programmatically.

For HashedTimelockERC20.cairo: Users can create HTLCs for ERC20 tokens, redeem tokens, and request refunds.
Refer to the contract source code for function details and usage instructions.

License
This project is licensed under the MIT License. See the LICENSE file for details.