mod lib;
use dep::aztec::macros::aztec;

#[aztec]
pub contract Train {
    use crate::lib::{bytes_to_u128_limbs, u128_limbs_to_bytes};
    use dep::aztec::encrypted_logs::log_assembly_strategies::default_aes128::event::encode_and_encrypt_event;
    use dep::aztec::event::event_interface::EventInterface;
    use dep::aztec::protocol_types::traits::{Packable, Serialize};
    use dep::aztec::state_vars::{private_immutable::PrivateImmutable, SharedMutable};
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
    struct HTLC_Private_User {
        owner: AztecAddress,
        randomness: Field,
    }
    #[derive(Eq, Packable)]
    struct HTLC_Public_User {
        src_receiver: AztecAddress,
        amount: u128,
        token: AztecAddress,
        hashlock_high: u128,
        hashlock_low: u128,
        secret_high: u128,
        secret_low: u128,
        timelock: u64,
        claimed: u8,
    }

    #[derive(Serialize)]
    #[event]
    struct TokenCommittedPublic {
        Id: Field,
        amount: u128,
        token: AztecAddress,
        timelock: u64,
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        src_receiver: AztecAddress,
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
    struct TokenRefundedPublic {
        Id: Field,
    }

    #[public]
    #[initializer]
    fn constructor() {}

    #[storage]
    struct Storage<Context> {
        contracts_private_user: Map<Field, PrivateImmutable<HTLC_Private_User, Context>, Context>,
        contracts_public_user: Map<Field, SharedMutable<HTLC_Public_User, 10, Context>, Context>,
    }

    #[private]
    fn commit_private_user(
        Id: Field,
        src_receiver: AztecAddress,
        timelock: u64,
        token: AztecAddress,
        amount: u128,
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        randomness: Field,
    ) {
        assert(amount > 0, "Funds Not Sent");

        // Safety: Ensure that the commitment with the given Id is not already initialized.
        unsafe {
            assert(!is_commitment_initialized(Id), "HTLCAlreadyExists");
        }

        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            commit_public_user(
                dst_chain,
                dst_asset,
                dst_address,
                src_asset,
                Id,
                src_receiver,
                timelock,
                token,
                amount,
            );
        }

        let htlc_note = HTLC_Private_User { owner: context.msg_sender(), randomness: randomness };
        storage.contracts_private_user.at(Id).initialize(htlc_note);

        Token::at(token)
            .transfer_in_private(context.msg_sender(), context.this_address(), amount, randomness)
            .call(&mut context);
    }

    #[internal]
    #[public]
    fn commit_public_user(
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        Id: Field,
        src_receiver: AztecAddress,
        timelock: u64,
        token: AztecAddress,
        amount: u128,
    ) {
        assert(context.timestamp() + 900 < timelock, "InvalidTimelock");
        let htlc_public = HTLC_Public_User {
            src_receiver: src_receiver,
            amount: amount,
            token: token,
            hashlock_high: 0 as u128,
            hashlock_low: 0 as u128,
            secret_high: 0 as u128,
            secret_low: 0 as u128,
            timelock: timelock,
            claimed: 1 as u8,
        };
        storage.contracts_public_user.at(Id).schedule_value_change(htlc_public);
        let log_msg = TokenCommittedPublic {
            Id: Id,
            amount: amount,
            token: token,
            timelock: timelock,
            dst_chain: dst_chain,
            dst_asset: dst_asset,
            dst_address: dst_address,
            src_asset: src_asset,
            src_receiver: src_receiver,
        };
        context.emit_public_log(log_msg);
    }

    #[private]
    fn add_lock_private_user(Id: Field, hashlock: [u8; 32], timelock: u64) {
        // Safety: Ensures that the commitment with the given Id is initialized before proceeding.
        unsafe {
            assert(is_commitment_initialized(Id), "HTLCNotExists");
        }

        let htlc_private = storage.contracts_private_user.at(Id).get_note();
        assert(htlc_private.owner == context.msg_sender(), "NoAllowance");

        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            add_lock_public_user(Id, hashlock, timelock);
        }
    }

    #[internal]
    #[public]
    fn add_lock_public_user(Id: Field, hashlock: [u8; 32], timelock: u64) {
        assert(context.timestamp() + 900 < timelock, "InvalidTimelock");

        let htlc_public = storage.contracts_public_user.at(Id).get_current_value();
        assert(htlc_public.claimed == 1, "AlreadyClaimed");
        assert(htlc_public.hashlock_high == (0 as u128), "HashlockAlreadySet");
        assert(htlc_public.hashlock_low == (0 as u128), "HashlockAlreadySet");

        let hashlock_tuple = bytes_to_u128_limbs(hashlock);
        let modified_htlc_public = HTLC_Public_User {
            src_receiver: htlc_public.src_receiver,
            amount: htlc_public.amount,
            token: htlc_public.token,
            hashlock_high: hashlock_tuple.0,
            hashlock_low: hashlock_tuple.1,
            secret_high: htlc_public.secret_high,
            secret_low: htlc_public.secret_low,
            timelock: timelock,
            claimed: htlc_public.claimed,
        };
        storage.contracts_public_user.at(Id).schedule_value_change(modified_htlc_public);
        let log_msg = TokenLockAddedPublic { Id, hashlock, timelock };
        context.emit_public_log(log_msg);
    }

    #[private]
    fn refund_private_user(Id: Field, randomness: Field) {
        // Safety: Ensures that the commitment with the given Id is initialized before proceeding.
        unsafe {
            assert(is_commitment_initialized(Id), "HTLCNotExists");
        }
        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            refund_public_user(Id);
        }

        let htlc_private = storage.contracts_private_user.at(Id).get_note();
        let htlc_public = storage.contracts_public_user.at(Id).get_current_value();

        Token::at(htlc_public.token)
            .transfer_in_private(
                context.this_address(),
                htlc_private.owner,
                htlc_public.amount,
                randomness,
            )
            .call(&mut context);
    }

    #[public]
    #[internal]
    fn refund_public_user(Id: Field) {
        let htlc_public = storage.contracts_public_user.at(Id).get_current_value();
        assert(htlc_public.claimed == 1, "AlreadyClaimed");
        assert(htlc_public.timelock < context.timestamp(), "NotPassedTimelock");
        let modified_htlc_public = HTLC_Public_User {
            src_receiver: htlc_public.src_receiver,
            amount: htlc_public.amount,
            token: htlc_public.token,
            hashlock_high: htlc_public.hashlock_high,
            hashlock_low: htlc_public.hashlock_low,
            secret_high: htlc_public.secret_high,
            secret_low: htlc_public.secret_low,
            timelock: htlc_public.timelock,
            claimed: 2 as u8,
        };

        storage.contracts_public_user.at(Id).schedule_value_change(modified_htlc_public);
        let log_msg = TokenRefundedPublic { Id };
        context.emit_public_log(log_msg);
    }

    unconstrained fn is_commitment_initialized(Id: Field) -> bool {
        storage.contracts_private_user.at(Id).is_initialized()
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
