use dep::aztec::macros::aztec;

#[aztec]
pub contract Train {
    use dep::aztec::encrypted_logs::log_assembly_strategies::default_aes128::note::encode_and_encrypt_note;
    use dep::aztec::protocol_types::traits::{Deserialize, Packable, Serialize};
    use dep::aztec::state_vars::{
        private_immutable::PrivateImmutable, public_immutable::PublicImmutable,
        public_mutable::PublicMutable, SharedMutable,
    };
    use dep::token::Token;
    use aztec::macros::{
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
        owner: AztecAddress, // sender
        src_receiver: AztecAddress,
        token: AztecAddress,
        randomness: Field,
    }

    #[derive(Eq, Packable)]
    struct HTLC_Public {
        hashlock: [u8; 32],
        secret: [u8; 32],
        timelock: u64,
        claimed: u8,
    }

    pub struct Reward_Public {
        amount: u128,
        timelock: u64,
    }

    #[public]
    #[initializer]
    fn constructor() {}

    global DELAY_BLOCKS: u32 = 5;

    #[storage]
    struct Storage<Context> {
        contracts_private: Map<Field, PrivateImmutable<HTLC_Private, Context>, Context>,
        contracts_public: Map<Field, SharedMutable<HTLC_Public, DELAY_BLOCKS, Context>, Context>,
        rewards_public: Map<Field, PublicImmutable<Reward_Public, Context>, Context>,
    }

    #[private]
    fn commit_private(
        hop_chains: [str<16>; 5],
        hop_assets: [str<16>; 5],
        hop_addresses: [str<64>; 5],
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
        Token::at(token).transfer_in_private(
            context.msg_sender(),
            context.this_address(),
            amount,
            randomness,
        );

        let htlc_note =
            HTLC_Private { amount, owner: context.msg_sender(), src_receiver, token, randomness };

        storage.contracts_private.at(Id).initialize(htlc_note).emit(encode_and_encrypt_note(
            &mut context,
            src_receiver,
            context.msg_sender(),
        ));
        unsafe {
            commit_public(
                hop_chains,
                hop_assets,
                hop_addresses,
                dst_chain,
                dst_asset,
                dst_address,
                src_asset,
                Id,
                timelock,
            );
        }
    }

    #[public]
    fn commit_public(
        hop_chains: [str<16>; 5],
        hop_assets: [str<16>; 5],
        hop_addresses: [str<64>; 5],
        dst_chain: str<16>,
        dst_asset: str<16>,
        dst_address: str<64>,
        src_asset: str<16>,
        Id: Field,
        timelock: u64,
    ) {
        let htlc_public = HTLC_Public { hashlock: [0; 32], secret: [0; 32], timelock, claimed: 1 };

        // storage.contracts_public.at(Id).initialize(htlc_public);
        // context.emit_public_log(
        //     (hop_chains,
        //     hop_assets,
        //     hop_addresses,
        //     dst_chain,
        //     dst_asset,
        //     dst_address,
        //     src_asset,
        //     Id,
        //     timelock,)
        // );

    }

}
