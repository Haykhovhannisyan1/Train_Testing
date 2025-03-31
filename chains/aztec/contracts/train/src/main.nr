mod lib;
use dep::aztec::macros::aztec;

#[aztec]
pub contract Train {
    use crate::lib::{bytes_to_u128_limbs, u128_limbs_to_bytes};
    use dep::aztec::encrypted_logs::log_assembly_strategies::default_aes128::event::encode_and_encrypt_event;
    use dep::aztec::event::event_interface::EventInterface;
    use dep::aztec::protocol_types::traits::{Packable, Serialize};
    use dep::aztec::state_vars::{
        private_immutable::PrivateImmutable, public_immutable::PublicImmutable, SharedMutable,
    };
    use dep::sha256;
    use dep::token::Token;
    use aztec::macros::{
        events::event,
        functions::{initializer, internal, private, public},
        notes::note,
        storage::storage,
    };
    use aztec::prelude::{AztecAddress, Map};
    use std::meta::derive;

    #[note]
    #[derive(Eq)]
    struct HTLC_Private {
        amount: u128,
        owner: AztecAddress,
        src_receiver: AztecAddress,
        token: AztecAddress,
        randomness: Field,
    }

    #[derive(Eq, Packable)]
    struct HTLC_Public {
        hashlock_high: u128,
        hashlock_low: u128,
        secret_high: u128,
        secret_low: u128,
        timelock: u64,
        claimed: u8,
    }

    #[derive(Eq, Packable)]
    struct Reward_Public {
        amount: u128,
        timelock: u64,
    }

    #[derive(Serialize)]
    #[event]
    struct TokenCommittedPublic {
        Id: Field,
        timelock: u64,
    }

    #[derive(Serialize)]
    #[event]
    struct TokenCommittedPrivate {
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        amount: u128,
        owner: AztecAddress,
        src_receiver: AztecAddress,
        token: AztecAddress,
    }

    #[derive(Serialize)]
    #[event]
    struct TokenLockAddedPublic {
        Id: Field,
        hashlock: [u8; 32],
        timelock: u64,
    }

    #[derive(Serialize)]
    #[event]
    struct TokenLockedPublic {
        Id: Field,
        hashlock: [u8; 32],
        amount: u128,
        reward_amount: u128,
        token: AztecAddress,
        timelock: u64,
        reward_timelock: u64,
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
    }

    #[derive(Serialize)]
    #[event]
    struct TokenRedeemedPublic {
        Id: Field,
        hashlock: [u8; 32],
        secret: [u8; 32],
    }

    #[public]
    #[initializer]
    fn constructor() {}

    #[storage]
    struct Storage<Context> {
        contracts_private: Map<Field, PrivateImmutable<HTLC_Private, Context>, Context>,
        contracts_public: Map<Field, SharedMutable<HTLC_Public, 3, Context>, Context>,
        rewards_public: Map<Field, PublicImmutable<Reward_Public, Context>, Context>,
    }

    #[private]
    fn commit_private(
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        Id: Field,
        src_receiver: AztecAddress,
        timelock: u64,
        token: AztecAddress,
        amount: u128,
        reward_amount: u128,
        randomness: Field,
    ) {
        assert(amount != 0, "Funds Not Sent");

        let htlc_private = storage.contracts_private.at(Id).get_note();
        assert(htlc_private.amount <= 0, "HTLCAlreadyExists");

        let htlc_note =
            HTLC_Private { amount, owner: context.msg_sender(), src_receiver, token, randomness };
        storage.contracts_private.at(Id).initialize(htlc_note);

        TokenCommittedPrivate {
            dst_chain: dst_chain,
            dst_asset: dst_asset,
            dst_address: dst_address,
            src_asset: src_asset,
            amount: amount,
            owner: context.msg_sender(),
            src_receiver: src_receiver,
            token: token,
        }
            .emit(encode_and_encrypt_event(&mut context, src_receiver, context.this_address()));

        Token::at(token)
            .transfer_in_private(context.msg_sender(), context.this_address(), amount, randomness)
            .call(&mut context);

        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            commit_public(Id, timelock);
        }
    }

    #[internal]
    #[public]
    fn commit_public(Id: Field, timelock: u64) {
        assert(context.timestamp() + 900 < timelock, "InvalidTimelock");
        let htlc_public = HTLC_Public {
            hashlock_high: 0 as u128,
            hashlock_low: 0 as u128,
            secret_high: 0 as u128,
            secret_low: 0 as u128,
            timelock: timelock,
            claimed: 1,
        };
        storage.contracts_public.at(Id).schedule_value_change(htlc_public);
        let log_msg = TokenCommittedPublic { Id, timelock };
        context.emit_public_log(log_msg);
    }

    #[private]
    fn add_lock_private(Id: Field, hashlock: [u8; 32], timelock: u64) {
        let htlc_private = storage.contracts_private.at(Id).get_note();
        assert(htlc_private.owner == context.msg_sender(), "NoAllowanceOrHTLCNotExists");
        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            add_lock_public(Id, hashlock, timelock);
        }
    }

    #[internal]
    #[public]
    fn add_lock_public(Id: Field, hashlock: [u8; 32], timelock: u64) {
        assert(context.timestamp() + 900 < timelock, "InvalidTimelock");

        let htlc_public = storage.contracts_public.at(Id).get_current_value();
        assert(htlc_public.claimed == 1, "AlreadyClaimed");

        assert(htlc_public.hashlock_high == (0 as u128), "HashlockAlreadySet");
        assert(htlc_public.hashlock_low == (0 as u128), "HashlockAlreadySet");

        let hashlock_tuple = bytes_to_u128_limbs(hashlock);
        let htlc_public_ = HTLC_Public {
            hashlock_high: hashlock_tuple.0 as u128,
            hashlock_low: hashlock_tuple.1 as u128,
            secret_high: 0 as u128,
            secret_low: 0 as u128,
            timelock: timelock,
            claimed: 1,
        };
        storage.contracts_public.at(Id).schedule_value_change(htlc_public_);
        let log_msg = TokenLockAddedPublic { Id, hashlock, timelock };
        context.emit_public_log(log_msg);
    }

    #[private]
    fn lock_private(
        Id: Field,
        hashlock: [u8; 32],
        amount: u128,
        reward_amount: u128,
        timelock: u64,
        reward_timelock: u64,
        token: AztecAddress,
        randomness: Field,
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
    ) {
        let htlc_private = storage.contracts_private.at(Id).get_note();
        assert(htlc_private.amount <= 0, "HTLCAlreadyExists");
        assert(amount > 0, "FundsNotSent");
        let htlc_note = HTLC_Private {
            amount: amount,
            owner: context.msg_sender(),
            src_receiver: AztecAddress::zero(),
            token: token,
            randomness: randomness,
        };
        storage.contracts_private.at(Id).initialize(htlc_note);

        Token::at(token)
            .transfer_in_private(
                context.msg_sender(),
                context.this_address(),
                amount + reward_amount,
                randomness,
            )
            .call(&mut context);
        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            lock_public(
                Id,
                hashlock,
                amount,
                reward_amount,
                token,
                timelock,
                reward_timelock,
                dst_chain,
                dst_asset,
                dst_address,
                src_asset,
            );
        }
    }

    #[internal]
    #[public]
    fn lock_public(
        Id: Field,
        hashlock: [u8; 32],
        amount: u128,
        reward_amount: u128,
        token: AztecAddress,
        timelock: u64,
        reward_timelock: u64,
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
    ) {
        assert(context.timestamp() + 3600 < timelock, "InvalidTimelock");
        assert(reward_timelock < timelock, "InvalidRewardTimelock");
        assert(reward_timelock > context.timestamp(), "InvalidRewardTimelock");
        let hashlock_tuple = bytes_to_u128_limbs(hashlock);
        let htlc_public_ = HTLC_Public {
            hashlock_high: hashlock_tuple.0 as u128,
            hashlock_low: hashlock_tuple.1 as u128,
            secret_high: 0 as u128,
            secret_low: 0 as u128,
            timelock: timelock,
            claimed: 1,
        };
        storage.contracts_public.at(Id).schedule_value_change(htlc_public_);

        if reward_amount != 0 {
            let reward_data_ = Reward_Public { amount: reward_amount, timelock: reward_timelock };
            storage.rewards_public.at(Id).initialize(reward_data_);
        }

        let log_msg = TokenLockedPublic {
            Id: Id,
            hashlock: hashlock,
            amount: amount,
            reward_amount: reward_amount,
            token: token,
            timelock: timelock,
            reward_timelock: reward_timelock,
            dst_chain: dst_chain,
            dst_asset: dst_asset,
            dst_address: dst_address,
            src_asset: src_asset,
        };

        context.emit_public_log(log_msg);
    }

    #[private]
    fn redeem_private(Id: Field, secret: [u8; 32], randomness: Field) {
        let htlc_private = storage.contracts_private.at(Id).get_note();
        assert(htlc_private.amount > 0, "HTLCNotExists");

        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            redeem_public(Id, secret);
        }

        // TODO: handle rewards in case it is possible
        let rewards_public = storage.rewards_public.at(Id).read();

        if htlc_private.src_receiver == AztecAddress::zero() {
            Token::at(htlc_private.token)
                .transfer_in_private(
                    context.this_address(),
                    context.msg_sender(),
                    htlc_private.amount,
                    randomness,
                )
                .call(&mut context);
        } else {
            Token::at(htlc_private.token)
                .transfer_in_private(
                    context.this_address(),
                    htlc_private.src_receiver,
                    htlc_private.amount,
                    randomness,
                )
                .call(&mut context);
        }
    }

    #[public]
    #[internal]
    fn redeem_public(Id: Field, secret: [u8; 32]) {
        let htlc_public = storage.contracts_public.at(Id).get_current_value();
        let hashed_secret = sha256::sha256_var(secret, secret.len() as u64);
        let hashed_secret_tuple = bytes_to_u128_limbs(hashed_secret);
        assert(htlc_public.hashlock_high == hashed_secret_tuple.0, "HashlockNotMatch");
        assert(htlc_public.hashlock_low == hashed_secret_tuple.1, "HashlockNotMatch");
        assert(htlc_public.claimed == 1, "AlreadyClaimed");

        let htlc_public_ = HTLC_Public {
            hashlock_high: htlc_public.hashlock_high as u128,
            hashlock_low: htlc_public.hashlock_low as u128,
            secret_high: hashed_secret_tuple.0 as u128,
            secret_low: hashed_secret_tuple.1 as u128,
            timelock: htlc_public.timelock,
            claimed: 3,
        };

        storage.contracts_public.at(Id).schedule_value_change(htlc_public_);

        let log_msg = TokenRedeemedPublic {
            Id: Id,
            hashlock: u128_limbs_to_bytes(htlc_public.hashlock_high, htlc_public.hashlock_low),
            secret: secret,
        };

        context.emit_public_log(log_msg);
    }

    #[test]
    fn test_conversion() {
        let original_bytes: [u8; 32] = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32,
        ];
        let (high, low) = bytes_to_u128_limbs(original_bytes);
        let reconstructed_bytes = u128_limbs_to_bytes(high, low);
        assert(original_bytes == reconstructed_bytes);
    }
}
