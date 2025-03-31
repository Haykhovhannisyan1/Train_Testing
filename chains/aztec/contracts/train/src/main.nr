mod lib;
use dep::aztec::macros::aztec;

#[aztec]
pub contract Train {
    use crate::lib::{bytes_to_u128_limbs, u128_limbs_to_bytes};
    use dep::aztec::encrypted_logs::log_assembly_strategies::default_aes128::event::{
        encode_and_encrypt_event, encode_and_encrypt_event_unconstrained,
    };
    use dep::aztec::event::event_interface::EventInterface;
    use dep::aztec::protocol_types::traits::{Deserialize, Packable, Serialize};
    use dep::aztec::state_vars::{
        private_immutable::PrivateImmutable, public_immutable::PublicImmutable,
        public_mutable::PublicMutable, SharedMutable,
    };
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

    pub struct Reward_Public {
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
    struct TokenCommitedPrivate {
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        amount: u128,
        owner: AztecAddress,
        src_receiver: AztecAddress,
        token: AztecAddress,
    }

    #[public]
    #[initializer]
    fn constructor() {}

    #[storage]
    struct Storage<Context> {
        contracts_private: Map<Field, PrivateImmutable<HTLC_Private, Context>, Context>,
        contracts_public: Map<Field, SharedMutable<HTLC_Public, 3, Context>, Context>,
        contracts_funded: Map<Field, SharedMutable<bool, 340282366920938463463374607431768211455, Context>, Context>, // The 2^128 block following the data is immutable, ensuring it is never altered.
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
        randomness: Field,
    ) {
        assert(amount != 0, "Funds Not Sent");

        let htlc_note =
            HTLC_Private { amount, owner: context.msg_sender(), src_receiver, token, randomness };
        storage.contracts_private.at(Id).initialize(htlc_note);

        TokenCommitedPrivate {
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
        // Safety: The contract intentionally exposes these parameters as public.
        unsafe {
            commit_public(Id, timelock);
        }
    }

    #[public]
    fn commit_public(Id: Field, timelock: u64) {
        assert(context.timestamp() + 900 < timelock, "InvalidTimelock");
        assert(
            storage.contracts_public.at(Id).get_current_value().timelock > 0,
            "HTLCAlreadyExists",
        );
        let htlc_public = HTLC_Public {
            hashlock_high: 0 as u128,
            hashlock_low: 0 as u128,
            secret_high: 0 as u128,
            secret_low: 0 as u128,
            timelock,
            claimed: 1,
        };
        storage.contracts_public.at(Id).schedule_value_change(htlc_public);
        let log_msg = TokenCommittedPublic { Id, timelock };
        context.emit_public_log(log_msg);
    }

    #[private]
    fn commit_finilaze(Id: Field, randomness: Field) {
        assert(storage.contracts_public.at(Id).get_current_value().timelock > 0, "HTLCNotExists");
        let htlc_private: HTLC_Private = storage.contracts_private.at(Id).get_note();
        assert(htlc_private.owner == context.msg_sender(), "IncorrectHTLC");
        Token::at(htlc_private.token).transfer_in_private(
            context.msg_sender(),
            context.this_address(),
            htlc_private.amount,
            randomness,
        );
        let data: bool = true;
        storage.contracts_funded.at(Id).schedule_value_change(data);
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
