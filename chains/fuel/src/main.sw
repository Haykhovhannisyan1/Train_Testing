            //               ............                                                                                                          ......                                                    
            //          ......................                           ....                                                                      .......                                                   
            //       ............................                        .....                                                                     .......                                                   
            //      .............................                        .....                                                                      ....                                                     
            //      ..............................                       .....                                                                                                                               
            //      ..............................                       .....                                                                                                                               
            //      ....                      ....                       .....               ...        .......            .......                   ...        ...         .....                            
            //      ....                      ....                 ...................      .....  .............      ..................            .....      .....  .................                      
            //      ....                      ....                 ...................      ....................   .......................          .....      ..........................                    
            //      .....                    .....                 ...................      ............          ............ .............        .....      ..............  ............                  
            //      ........              ........                       .....              ........            ........             ........       .....      ........              .......                 
            //      ............      ............                       .....              ......              ......                 .......      .....      .......                .......                
            //      ..............................                       .....              ......             ......                    .....      .....      ......                  ......                
            //      ..............................                       .....              .....             ......                     ......     .....      .....                    .....                
            //      ..............................                       .....              .....             .....                       .....     .....      .....                    .....                
            //       ............................                        .....              .....             .....                       .....     .....      .....                    .....                
            //        ..........................                         .....              .....             .....                       .....     .....      .....                    .....                
            //         ........................                          .....              .....             ......                      .....     .....      .....                    .....                
            //           ....................                            .....              .....              ......                    ......     .....      .....                    .....                
            //           .....          .....                            .....              .....              .......                 ........     .....      .....                    .....                
            //         ........................                          .......            .....               ........              .........     .....      .....                    .....                
            //       ......                .....                          .............     .....                .........         ............     .....      .....                    .....                
            //     ...............................                         .............    .....                  ...................... .....     .....      .....                    .....                
            //    ..................................                         ...........    .....                     .................   .....     .....      .....                    .....                
            //     ..                           ...                              ......      ...                           ........        ...       ...        ...                      ...                 
                                                                                                                                                                                                          

contract;

use std::{
    auth::*,
    asset::*,
    block::*,
    context::*,
    bytes::Bytes,
    call_frames::*,
    hash::*,
    storage::storage_vec::*,
    b512::B512,
    ecr::ec_recover_address,
    bytes_conversions::{u64::*, u256::*, b256::*},
};

// Interface defining HTLC functions
abi Train {
    #[payable]
    #[storage(read, write)]
    fn commit(
        hopChains: [str[64]; 5],
        hopAssets: [str[64]; 5],
        hopAddresses: [str[64]; 5],
        dstChain: str[64],
        dstAsset: str[64],
        dstAddress: str[64],
        srcAsset: str[64],
        Id: u256,
        srcReceiver: Address,
        timelock: u64
    ) -> u256;

    #[storage(read, write)]
    fn refund(Id: u256) -> bool;

    #[storage(read, write)]
    fn add_lock(Id: u256, hashlock: b256, timelock: u64) -> u256;

    #[storage(read, write)]
    fn add_lock_sig(signature: B512, Id: u256, hashlock: b256, timelock: u64) -> u256;

    #[payable]
    #[storage(read, write)]
    fn lock(
        Id: u256,
        hashlock: b256,
        reward: u64,
        rewardTimelock: u64,
        timelock: u64,
        srcReceiver: Address,
        srcAsset: str[64],
        dstChain: str[64],
        dstAddress: str[64],
        dstAsset: str[64]
    ) -> u256;

    #[storage(read, write)]
    fn redeem(Id: u256, secret: u256) -> bool;

    #[storage(read)]
    fn get_htlc_details(Id: u256) -> Option<HTLC>;

    #[storage(read)]
    fn get_reward_details(Id: u256) -> Option<Reward>;
}

// Events for logging HTLC state changes
pub struct TokenCommitted {
    hopChains: [str[64]; 5],
    hopAssets: [str[64]; 5],
    hopAddresses: [str[64]; 5],
    Id: u256,
    dstChain: str[64],
    dstAsset: str[64],
    dstAddress: str[64],
    sender: Address,
    srcReceiver: Address,
    srcAsset: str[64],
    amount: u64,
    timelock: u64,
    assetId: AssetId,
}

pub struct TokenLocked {
    Id: u256,
    hashlock: b256,
    dstChain: str[64],
    dstAddress: str[64],
    dstAsset: str[64],
    sender: Address,
    srcReceiver: Address,
    srcAsset: str[64],
    amount: u64,
    reward: u64,
    rewardTimelock: u64,
    timelock: u64,
    assetId: AssetId,
}

pub struct TokenLockAdded {
    Id: u256,
    hashlock: b256,
    timelock: u64,
}

pub struct TokenRefuned {
    Id: u256,
}

pub struct TokenRedeemed {
    Id: u256,
    redeemAddress: Identity,
    secret: u256,
    hashlock: b256,
}

// Struct defining an HTLC contract state
pub struct HTLC {
    amount: u64,
    hashlock: b256,
    secret: u256,
    sender: Address,
    srcReceiver: Address,
    timelock: u64,
    assetId: AssetId,
    claimed: u8,
}

// Reward struct for incentivizing early redeemers
pub struct Reward {
    amount: u64,
    timelock: u64,
}

// Storage for HTLCs and rewards
storage {
    contracts: StorageMap<u256, HTLC> = StorageMap::<u256, HTLC> {},
    rewards: StorageMap<u256, Reward> = StorageMap::<u256, Reward> {},
}

// Check if an HTLC exists
#[storage(read)]
fn has_htlc(Id: u256) -> bool {
    match storage.contracts.get(Id).try_read() {
        Some(_) => true,
        None => false,
    }
}

// Check if a reward exists
#[storage(read)]
fn has_reward(Id: u256) -> bool {
    match storage.rewards.get(Id).try_read() {
        Some(_) => true,
        None => false,
    }
}

// Implementation of the HTLC functions
impl Train for Contract {
    #[payable]
    #[storage(read, write)]
    fn commit(
        hopChains: [str[64]; 5],
        hopAssets: [str[64]; 5],
        hopAddresses: [str[64]; 5],
        dstChain: str[64],
        dstAsset: str[64],
        dstAddress: str[64],
        srcAsset: str[64],
        Id: u256,
        srcReceiver: Address,
        timelock: u64
    ) -> u256 {
        require(msg_amount() > 0, "Funds Not Sent");
        require(timelock > timestamp() + 900, "Not Future Timelock");
        require(!has_htlc(Id), "Contract Already Exists");

        let htlc = HTLC {
            sender: msg_sender().unwrap().as_address().unwrap(),
            srcReceiver: srcReceiver,
            hashlock: b256::from(1),
            timelock: timelock,
            amount: msg_amount(),
            secret: 1,
            assetId: msg_asset_id(),
            claimed: 1,
        };

        let result = storage.contracts.try_insert(Id, htlc);
        assert(result.is_ok());

        log(TokenCommitted {
            hopChains,
            hopAssets,
            hopAddresses,
            Id,
            dstChain,
            dstAsset,
            dstAddress,
            sender: msg_sender().unwrap().as_address().unwrap(),
            srcReceiver,
            srcAsset,
            amount: msg_amount(),
            timelock,
            assetId: msg_asset_id(),
        });

        Id
    }

    #[storage(read, write)]
    fn refund(Id: u256) -> bool {
        require(has_htlc(Id), "Contract Does Not Exist");
        let mut htlc: HTLC = storage.contracts.get(Id).try_read().unwrap();

        require(htlc.claimed == 1, "Already Claimed");
        require(htlc.timelock < timestamp(), "Not Passed Timelock");

        htlc.claimed = 2;
        storage.contracts.insert(Id, htlc);

        if has_reward(Id) {
            let reward: Reward = storage.rewards.get(Id).try_read().unwrap();
            transfer(Identity::Address(htlc.sender), htlc.assetId, htlc.amount + reward.amount);
        } else {
            transfer(Identity::Address(htlc.sender), htlc.assetId, htlc.amount);
        }

        log(TokenRefuned { Id });

        true
    }

    #[storage(read, write)]
    fn add_lock(Id: u256, hashlock: b256, timelock: u64) -> u256 {
        require(has_htlc(Id), "Contract Does Not Exist");
        require(timelock > timestamp() + 900, "Not Future Timelock");

        let mut htlc: HTLC = storage.contracts.get(Id).try_read().unwrap();
        require(htlc.claimed == 1, "Already Claimed");
        require(htlc.hashlock == b256::from(1), "Hashlock Already Set");

        htlc.hashlock = hashlock;
        htlc.timelock = timelock;
        storage.contracts.insert(Id, htlc);

        log(TokenLockAdded { Id, hashlock, timelock });

        Id
    }

        #[storage(read, write)]
    fn add_lock_sig(signature: B512, Id: u256, hashlock: b256, timelock: u64) -> u256 {
        require(has_htlc(Id), "Contract Does Not Exist");
        require(timelock > timestamp() + 900, "Not Future Timelock");

        let mut htlc: HTLC = storage.contracts.get(Id).try_read().unwrap();

        // Ensure the caller is authorized via ECDSA signature verification
        let message: [b256; 3] = [Id.into(), hashlock, timelock.as_u256().into()];
        let message_hash = sha256(message);
        require(htlc.sender == ec_recover_address(signature, message_hash).unwrap(), "Invalid Signature");

        require(htlc.claimed == 1, "Already Claimed");
        require(htlc.hashlock == b256::from(1), "Hashlock Already Set");

        htlc.hashlock = hashlock;
        htlc.timelock = timelock;
        storage.contracts.insert(Id, htlc);

        log(TokenLockAdded { Id, hashlock, timelock });

        Id
    }

    #[payable]
    #[storage(read, write)]
    fn lock(
        Id: u256,
        hashlock: b256,
        reward: u64,
        rewardTimelock: u64,
        timelock: u64,
        srcReceiver: Address,
        srcAsset: str[64],
        dstChain: str[64],
        dstAddress: str[64],
        dstAsset: str[64]
    ) -> u256 {
        require(!has_htlc(Id), "Contract Already Exists");
        require(msg_amount() > reward, "Funds Not Sent");
        require(timelock > timestamp() + 900, "Not Future Timelock");
        require(rewardTimelock < timelock && rewardTimelock > timestamp(), "Invalid Reward Timelock");

        let htlc = HTLC {
            sender: msg_sender().unwrap().as_address().unwrap(),
            srcReceiver,
            hashlock,
            timelock,
            amount: msg_amount() - reward,
            secret: 1,
            assetId: msg_asset_id(),
            claimed: 1,
        };

        let result = storage.contracts.try_insert(Id, htlc);
        assert(result.is_ok());

        if reward != 0 {
            let reward_data = Reward {
                amount: reward,
                timelock: rewardTimelock,
            };
            let reward_result = storage.rewards.try_insert(Id, reward_data);
            assert(reward_result.is_ok());
        }

        log(TokenLocked {
            Id,
            hashlock,
            dstChain,
            dstAddress,
            dstAsset,
            sender: msg_sender().unwrap().as_address().unwrap(),
            srcReceiver,
            srcAsset,
            amount: msg_amount() - reward,
            reward,
            rewardTimelock,
            timelock,
            assetId: msg_asset_id(),
        });

        Id
    }

    #[storage(read, write)]
    fn redeem(Id: u256, secret: u256) -> bool {
        require(has_htlc(Id), "Contract Does Not Exist");
        let mut htlc: HTLC = storage.contracts.get(Id).try_read().unwrap();

        require(htlc.hashlock == sha256(secret), "Hashlock Not Match");
        require(htlc.claimed == 1, "Already Claimed");

        htlc.secret = secret;
        htlc.claimed = 3;
        storage.contracts.insert(Id, htlc);

        if has_reward(Id) {
            let reward: Reward = storage.rewards.get(Id).try_read().unwrap();

            // Check if reward timelock has passed and distribute funds accordingly
            if reward.timelock < timestamp() {
                transfer(Identity::Address(htlc.srcReceiver), htlc.assetId, htlc.amount);
                transfer(Identity::Address(htlc.sender), htlc.assetId, reward.amount);
            } else {
                let sender = match msg_sender().unwrap() {
                    Identity::Address(addr) => addr,
                    _ => {
                        require(false, "Not an Address");
                        Address::from(0x0000000000000000000000000000000000000000000000000000000000000000)
                    }
                };

                if htlc.srcReceiver == sender {
                    transfer(Identity::Address(htlc.srcReceiver), htlc.assetId, reward.amount + htlc.amount);
                } else {
                    transfer(Identity::Address(sender), htlc.assetId, reward.amount);
                    transfer(Identity::Address(htlc.srcReceiver), htlc.assetId, htlc.amount);
                }
            }
        } else {
            transfer(Identity::Address(htlc.srcReceiver), htlc.assetId, htlc.amount);
        }

        log(TokenRedeemed {
            Id,
            redeemAddress: msg_sender().unwrap(),
            secret,
            hashlock: htlc.hashlock,
        });

        true
    }

    #[storage(read)]
    fn get_htlc_details(Id: u256) -> Option<HTLC> {
        match storage.contracts.get(Id).try_read() {
            Some(htlc) => Some(htlc),
            None => {
                log("Contract Does Not Exist");
                None
            }
        }
    }

    #[storage(read)]
    fn get_reward_details(Id: u256) -> Option<Reward> {
        match storage.rewards.get(Id).try_read() {
            Some(reward) => Some(reward),
            None => {
                log("Reward Does Not Exist");
                None
            }
        }
    }
}

