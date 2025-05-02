mod lib;
mod types;
use dep::aztec::macros::aztec;

#[aztec]
pub contract Train {
    use crate::lib::{bytes_to_u128_limbs, u128_limbs_to_bytes};
    use crate::types::events::{
        TokenCommitted, TokenLockAdded, TokenLocked, TokenRedeemed, TokenRefunded,
    };
    use dep::aztec::messages::logs::note::encode_and_encrypt_note;
    use dep::aztec::protocol_types::traits::{FromField, Packable, Serialize, ToField};
    use dep::aztec::state_vars::{private_immutable::PrivateImmutable, SharedMutable};
    use dep::sha256;
    use dep::token::Token;
    use aztec::macros::{
        functions::{initializer, internal, private, public, utility, view},
        notes::note,
        storage::storage,
    };
    use aztec::prelude::{AztecAddress, Map};
    use std::meta::derive;

    #[note]
    #[derive(Eq)]
    struct HTLC_Private {
        owner: AztecAddress,
        randomness: Field,
    }
    #[derive(Eq, Packable, Serialize)]
    pub struct HTLC_Public {
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

    #[public]
    #[initializer]
    fn constructor() {}

    #[storage]
    struct Storage<Context> {
        contracts_private: Map<Field, PrivateImmutable<HTLC_Private, Context>, Context>,
        contracts_public_user: Map<Field, SharedMutable<HTLC_Public, 3, Context>, Context>,
        contracts_public_solver: Map<Field, SharedMutable<HTLC_Public, 3, Context>, Context>,
    }

    #[private]
    fn commit_private_user(
        Id: Field,
        src_receiver: AztecAddress,
        timelock: u64,
        token: AztecAddress,
        amount: u128,
        dst_chain: str<8>,
        dst_asset: str<8>,
        dst_address: str<48>,
        randomness: Field,
    ) {
        assert(amount > 0, "Funds Not Sent");

        // Safety: The contract intentionally exposes these parameters as public.
        Train::at(context.this_address())
            .commit_public_user(
                dst_chain,
                dst_asset,
                dst_address,
                Id,
                src_receiver,
                timelock,
                token,
                amount,
            )
            .enqueue(&mut context);

        let htlc_note = HTLC_Private { owner: context.msg_sender(), randomness: randomness };
        storage.contracts_private.at(Id).initialize(htlc_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));

        Token::at(token)
            .transfer_to_public(context.msg_sender(), context.this_address(), amount, randomness)
            .call(&mut context);
    }

    #[internal]
    #[public]
    fn commit_public_user(
        dst_chain: str<8>,
        dst_asset: str<8>,
        dst_address: str<48>,
        Id: Field,
        src_receiver: AztecAddress,
        timelock: u64,
        token: AztecAddress,
        amount: u128,
    ) {
        assert(context.timestamp() + 900 < timelock, "InvalidTimelock");
        let htlc_public = HTLC_Public {
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
        let log_msg = TokenCommitted {
            Id: Id,
            amount: amount,
            token: token,
            timelock: timelock,
            dst_chain: dst_chain,
            dst_asset: dst_asset,
            dst_address: dst_address,
            src_receiver: src_receiver,
        };
        context.emit_public_log(log_msg.pack());
    }

    #[private]
    fn add_lock_private_user(Id: Field, hashlock: [u8; 32], timelock: u64) {
        let htlc_private = storage.contracts_private.at(Id).get_note();
        assert(htlc_private.owner == context.msg_sender(), "NoAllowance");

        // Safety: The contract intentionally exposes these parameters as public.
        Train::at(context.this_address()).add_lock_public_user(Id, hashlock, timelock).enqueue(
            &mut context,
        );
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
        let modified_htlc_public = HTLC_Public {
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
        let log_msg = TokenLockAdded { Id, hashlock, timelock };
        context.emit_public_log(log_msg.pack());
    }

    #[private]
    fn refund_private(Id: Field, is_solver: bool, randomness: Field) {
        // Safety: The contract intentionally exposes these parameters as public.
        Train::at(context.this_address()).refund_public(Id, is_solver).enqueue(&mut context);

        let mut htlc_private = storage.contracts_private.at(Id).get_note();
        let mut htlc_public = storage.contracts_public_user.at(Id).get_current_value();

        if is_solver {
            htlc_public = storage.contracts_public_solver.at(Id).get_current_value();
        }

        Token::at(htlc_public.token)
            .transfer_to_private(htlc_private.owner, htlc_public.amount)
            .call(&mut context);
    }

    #[public]
    #[internal]
    fn refund_public(Id: Field, is_solver: bool) {
        let mut htlc_public = storage.contracts_public_user.at(Id).get_current_value();
        if is_solver {
            htlc_public = storage.contracts_public_solver.at(Id).get_current_value();
        }
        assert(htlc_public.claimed == 1, "AlreadyClaimed");
        assert(htlc_public.timelock < context.timestamp(), "NotPassedTimelock");
        let modified_htlc_public = HTLC_Public {
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

        if is_solver {
            storage.contracts_public_solver.at(Id).schedule_value_change(modified_htlc_public);
        } else {
            storage.contracts_public_user.at(Id).schedule_value_change(modified_htlc_public);
        }

        let log_msg = TokenRefunded { Id };
        context.emit_public_log(log_msg);
    }

    #[private]
    fn lock_private_solver(
        Id: Field,
        hashlock: [u8; 32],
        amount: u128,
        src_receiver: Field,
        timelock: u64,
        token: AztecAddress,
        randomness: Field,
        dst_chain: str<8>,
        dst_asset: str<8>,
        dst_address: str<48>,
    ) {
        assert(amount > 0, "FundsNotSent");
        // Safety: The contract intentionally exposes these parameters as public.
        Train::at(context.this_address())
            .lock_public_solver(
                Id,
                hashlock,
                amount,
                src_receiver,
                token,
                timelock,
                dst_chain,
                dst_asset,
                dst_address,
            )
            .enqueue(&mut context);

        let htlc_note = HTLC_Private { owner: context.msg_sender(), randomness: randomness };
        storage.contracts_private.at(Id).initialize(htlc_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));

        Token::at(token)
            .transfer_to_public(context.msg_sender(), context.this_address(), amount, randomness)
            .call(&mut context);
    }

    #[internal]
    #[public]
    fn lock_public_solver(
        Id: Field,
        hashlock: [u8; 32],
        amount: u128,
        src_receiver: Field,
        token: AztecAddress,
        timelock: u64,
        dst_chain: str<8>,
        dst_asset: str<8>,
        dst_address: str<48>,
    ) {
        assert(context.timestamp() + 2700 < timelock, "InvalidTimelock");
        let hashlock_tuple = bytes_to_u128_limbs(hashlock);
        let htlc_public = HTLC_Public {
            src_receiver: AztecAddress::from_field(src_receiver),
            amount: amount,
            token: token,
            hashlock_high: hashlock_tuple.0,
            hashlock_low: hashlock_tuple.1,
            secret_high: 0 as u128,
            secret_low: 0 as u128,
            timelock: timelock,
            claimed: 1 as u8,
        };
        storage.contracts_public_solver.at(Id).schedule_value_change(htlc_public);

        let log_msg = TokenLocked {
            Id: Id,
            hashlock: hashlock,
            amount: amount,
            src_receiver: src_receiver,
            token: token,
            timelock: timelock,
            dst_chain: dst_chain,
            dst_asset: dst_asset,
            dst_address: dst_address,
        };

        context.emit_public_log(log_msg.pack());
    }

    #[private]
    fn redeem_private_solver(Id: Field, secret: [u8; 32], randomness: Field) {
        // Safety: The contract intentionally exposes these parameters as public.
        Train::at(context.this_address()).redeem_public(Id, secret, true).enqueue(&mut context);

        let htlc_public = storage.contracts_public_user.at(Id).get_current_value();

        Token::at(htlc_public.token)
            .transfer_to_private(htlc_public.src_receiver, htlc_public.amount)
            .call(&mut context);
    }

    #[private]
    fn redeem_private_user(
        Id: Field,
        secret: [u8; 32],
        ownership_key: [u8; 32],
        randomness: Field,
    ) {
        // Safety: The contract intentionally exposes these parameters as public.
        Train::at(context.this_address()).redeem_public(Id, secret, false).enqueue(&mut context);

        let htlc_public = storage.contracts_public_solver.at(Id).get_current_value();
        let ownership_key_hashed = sha256::sha256_var(ownership_key, ownership_key.len() as u64);
        let ownership_key_tuple = bytes_to_u128_limbs(ownership_key_hashed);
        let owner_tuple =
            bytes_to_u128_limbs(((htlc_public.src_receiver).to_field()).to_le_bytes());
        assert(owner_tuple.0 == ownership_key_tuple.0, "NotAnOwner");
        assert(owner_tuple.1 == ownership_key_tuple.1, "NotAnOwner");

        Token::at(htlc_public.token)
            .transfer_to_private(context.msg_sender(), htlc_public.amount)
            .call(&mut context);
    }

    #[public]
    #[internal]
    fn redeem_public(Id: Field, secret: [u8; 32], is_solver: bool) {
        let mut htlc_public = storage.contracts_public_user.at(Id).get_current_value();
        if is_solver {
            htlc_public = storage.contracts_public_solver.at(Id).get_current_value();
        }
        assert(htlc_public.amount > 0, "HTLCNotExists"); // If it doesn't exist, all parameters will default to zero values.
        let hashed_secret = sha256::sha256_var(secret, secret.len() as u64);
        let hashed_secret_tuple = bytes_to_u128_limbs(hashed_secret);
        assert(htlc_public.hashlock_high == hashed_secret_tuple.0, "HashlockNotMatch");
        assert(htlc_public.hashlock_low == hashed_secret_tuple.1, "HashlockNotMatch");
        assert(htlc_public.claimed == 1, "AlreadyClaimed");
        let secret_limbs = bytes_to_u128_limbs(secret);

        let modified_htlc_public = HTLC_Public {
            src_receiver: htlc_public.src_receiver,
            amount: htlc_public.amount,
            token: htlc_public.token,
            hashlock_high: htlc_public.hashlock_high,
            hashlock_low: htlc_public.hashlock_low,
            secret_high: secret_limbs.0,
            secret_low: secret_limbs.1,
            timelock: htlc_public.timelock,
            claimed: 3 as u8,
        };

        if is_solver {
            storage.contracts_public_solver.at(Id).schedule_value_change(modified_htlc_public);
        } else {
            storage.contracts_public_user.at(Id).schedule_value_change(modified_htlc_public);
        }

        let log_msg = TokenRedeemed {
            Id: Id,
            hashlock: u128_limbs_to_bytes(htlc_public.hashlock_high, htlc_public.hashlock_low),
            secret: secret,
        };

        context.emit_public_log(log_msg.pack());
    }

    // This utility function should be invoked by the frontend before each function call
    // where the existence or non-existence of an HTLC is a critical security check.
    #[utility]
    unconstrained fn is_contract_initialized(Id: Field) -> bool {
        let private_context = storage.contracts_private.at(Id).is_initialized();
        let user_public = storage.contracts_public_user.at(Id).get_current_value();
        let solver_public = storage.contracts_public_solver.at(Id).get_current_value();
        let mut public_initialized: bool = true;
        if (user_public.amount > 0 as u128 | solver_public.amount > 0 as u128) {
            public_initialized = true;
        }
        private_context | public_initialized
    }

    #[view]
    #[public]
    fn get_htlc_public_solver(key: Field, is_solver: bool) -> pub HTLC_Public {
        let mut result: HTLC_Public = storage.contracts_public_user.at(key).get_current_value();
        if is_solver {
            result = storage.contracts_public_solver.at(key).get_current_value();
        }
        result
    }

}
