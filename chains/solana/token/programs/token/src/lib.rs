//   _____ ____      _    ___ _   _      ____  ____   ___ _____ ___   ____ ___  _
//  |_   _|  _ \    / \  |_ _| \ | |    |  _ \|  _ \ / _ \_   _/ _ \ / ___/ _ \| |
//    | | | |_) |  / _ \  | ||  \| |    | |_) | |_) | | | || || | | | |  | | | | |
//    | | |  _ <  / ___ \ | || |\  |    |  __/|  _ <| |_| || || |_| | |__| |_| | |___
//    |_| |_| \_\/_/   \_\___|_| \_|    |_|   |_| \_\\___/ |_| \___/ \____\___/|_____|

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{CloseAccount, Mint, Token, TokenAccount, Transfer},
};
use sha2::{Digest, Sha256};
use std::mem::size_of;
declare_id!("CgUW4QzGdxJLuCtNaiGmGaeHexX7Tbaevo3uHPwZXoo");
/// @title Pre Hashed Timelock Contracts (PHTLCs) on Solana SPL tokens.
///
/// This contract provides a way to lock and keep PHTLCs for SPL tokens.
///
/// Protocol:
///
///  1) commit(src_receiver, timelock, tokenContract, amount) - a
///      sender calls this to create a new HTLC on a given token (tokenContract)
///      for the given amount. A [u8; 32] Id is returned.
///  2) lock(src_receiver, hashlock, timelock, tokenContract, amount) - a
///      sender calls this to create a new HTLC on a given token (tokenContract)
///      for the given amount. A [u8; 32] Id is returned.
///  3) add_lock(Id, hashlock) - the sender calls this function
///      to add hashlock to the HTLC.
///  4) redeem(Id, secret) - once the src_receiver knows the secret of
///      the hashlock hash they can claim the tokens with this function
///  5) refund(Id) - after timelock has expired and if the src_receiver did not
///      redeem the tokens the sender / creator of the HTLC can get their tokens
///      back with this function.

/// @dev A small utility function that allows us to transfer funds out of the htlc.
///
/// * `sender` - htlc creator's account
/// * `Id` - The index of the htlc
/// * `htlc` - the htlc public key (PDA)
/// * `htlc_bump` - the htlc public key (PDA) bump
/// * `htlc_token_account` - The htlc Token account
/// * `token_program` - the token program address
/// * `destination_wallet` - The public key of the destination address (where to send funds)
/// * `amount` - the amount of token that is sent from `htlc_token_account` to `destination_wallet`
fn transfer_htlc_out<'info>(
    sender: AccountInfo<'info>,
    Id: [u8; 32],
    htlc: AccountInfo<'info>,
    htlc_bump: u8,
    htlc_token_account: &mut Account<'info, TokenAccount>,
    token_program: AccountInfo<'info>,
    destination_wallet: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let bump_vector = htlc_bump.to_le_bytes();
    let inner = vec![Id.as_ref(), bump_vector.as_ref()];
    let outer = vec![inner.as_slice()];

    // Perform the actual transfer
    let transfer_instruction = Transfer {
        from: htlc_token_account.to_account_info(),
        to: destination_wallet,
        authority: htlc.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_instruction,
        outer.as_slice(),
    );
    anchor_spl::token::transfer(cpi_ctx, amount)?;

    // Use the `reload()` function on an account to reload it's state. Since we performed the
    // transfer, we are expecting the `amount` field to have changed.
    let should_close = {
        htlc_token_account.reload()?;
        htlc_token_account.amount == 0
    };

    // If token account has no more tokens, it should be wiped out since it has no other use case.
    if should_close {
        let ca = CloseAccount {
            account: htlc_token_account.to_account_info(),
            destination: sender.to_account_info(),
            authority: htlc.to_account_info(),
        };
        let cpi_ctx =
            CpiContext::new_with_signer(token_program.to_account_info(), ca, outer.as_slice());
        anchor_spl::token::close_account(cpi_ctx)?;
    }

    Ok(())
}

/// @dev A small utility function that allows us to transfer funds and reward out of the htlc.
fn transfer_htlc_reward_out<'info>(
    sender: AccountInfo<'info>,
    Id: [u8; 32],
    htlc: AccountInfo<'info>,
    htlc_bump: u8,
    htlc_token_account: &mut Account<'info, TokenAccount>,
    token_program: AccountInfo<'info>,
    destination_wallet: AccountInfo<'info>,
    reward_wallet: AccountInfo<'info>,
    amount: u64,
    reward: u64,
) -> Result<()> {
    let bump_vector = htlc_bump.to_le_bytes();
    let inner = vec![Id.as_ref(), bump_vector.as_ref()];
    let outer = vec![inner.as_slice()];

    // Perform the actual transfer
    let transfer_instruction = Transfer {
        from: htlc_token_account.to_account_info(),
        to: destination_wallet,
        authority: htlc.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_instruction,
        outer.as_slice(),
    );
    anchor_spl::token::transfer(cpi_ctx, amount)?;

    // Perform the reward transfer
    let reward_instruction = Transfer {
        from: htlc_token_account.to_account_info(),
        to: reward_wallet,
        authority: htlc.to_account_info(),
    };
    let reward_cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        reward_instruction,
        outer.as_slice(),
    );
    anchor_spl::token::transfer(reward_cpi_ctx, reward)?;

    // Use the `reload()` function on an account to reload it's state. Since we performed the
    // transfer, we are expecting the `amount` field to have changed.
    let should_close = {
        htlc_token_account.reload()?;
        htlc_token_account.amount == 0
    };

    // If token account has no more tokens, it should be wiped out since it has no other use case.
    if should_close {
        let ca = CloseAccount {
            account: htlc_token_account.to_account_info(),
            destination: sender.to_account_info(),
            authority: htlc.to_account_info(),
        };
        let cpi_ctx =
            CpiContext::new_with_signer(token_program.to_account_info(), ca, outer.as_slice());
        anchor_spl::token::close_account(cpi_ctx)?;
    }

    Ok(())
}

#[program]
pub mod anchor_htlc {
    use super::*;

    /// @dev Sender / Payer sets up a new pre-hash time lock contract depositing the
    /// funds and providing the reciever/src_receiver and terms.
    /// @param src_receiver reciever of the funds.
    /// @param timelock UNIX epoch seconds time that the lock expires at.
    ///                  Refunds can be made after this time.
    /// @return Id of the new HTLC. This is needed for subsequent calls.
    pub fn commit(
        ctx: Context<Commit>,
        Id: [u8; 32],
        hopChains: Vec<String>,
        hopAssets: Vec<String>,
        hopAddress: Vec<String>,
        dst_chain: String,
        dst_asset: String,
        dst_address: String,
        src_asset: String,
        src_receiver: Pubkey,
        timelock: u64,
        amount: u64,
        commit_bump: u8,
    ) -> Result<[u8; 32]> {
        let clock = Clock::get().unwrap();
        let time: u64 = clock.unix_timestamp.try_into().unwrap();
        require!(timelock >= time + 900, HTLCError::InvalidTimeLock);
        require!(amount != 0, HTLCError::FundsNotSent);

        let htlc = &mut ctx.accounts.htlc;

        let bump_vector = commit_bump.to_le_bytes();
        let inner = vec![Id.as_ref(), bump_vector.as_ref()];
        let outer = vec![inner.as_slice()];
        let transfer_context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token_account.to_account_info(),
                to: ctx.accounts.htlc_token_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
            outer.as_slice(),
        );
        anchor_spl::token::transfer(transfer_context, amount)?;

        htlc.dst_address = dst_address;
        htlc.dst_chain = dst_chain;
        htlc.dst_asset = dst_asset;
        htlc.src_asset = src_asset;
        htlc.sender = *ctx.accounts.sender.to_account_info().key;
        htlc.src_receiver = src_receiver;
        htlc.hashlock = [0u8; 32];
        htlc.secret = [0u8; 32];
        htlc.amount = amount;
        htlc.timelock = timelock;
        htlc.reward = 0;
        htlc.reward_timelock = 0;
        htlc.token_contract = *ctx.accounts.token_contract.to_account_info().key;
        htlc.token_wallet = *ctx.accounts.htlc_token_account.to_account_info().key;
        htlc.claimed = 1;

        // msg!("hop chains: {:?}", hopChains);
        // msg!("hop assets: {:?}", hopAssets);
        // msg!("hop addresses: {:?}", hopAddresses);
        Ok(Id)
    }

    /// @dev Sender / Payer sets up a new hash time lock contract depositing the
    /// funds and providing the reciever and terms.
    /// @param src_receiver receiver of the funds.
    /// @param hashlock A sha-256 hash hashlock.
    /// @param timelock UNIX epoch seconds time that the lock expires at.
    ///                  Refunds can be made after this time.
    /// @return Id of the new HTLC. This is needed for subsequent calls.
    pub fn lock(
        ctx: Context<Lock>,
        Id: [u8; 32],
        hashlock: [u8; 32],
        timelock: u64,
        dst_chain: String,
        dst_address: String,
        dst_asset: String,
        src_asset: String,
        src_receiver: Pubkey,
        amount: u64,
        lock_bump: u8,
    ) -> Result<[u8; 32]> {
        let clock = Clock::get().unwrap();
        let time: u64 = clock.unix_timestamp.try_into().unwrap();
        require!(timelock >= time + 900, HTLCError::InvalidTimeLock);
        require!(amount != 0, HTLCError::FundsNotSent);

        let htlc = &mut ctx.accounts.htlc;

        let bump_vector = lock_bump.to_le_bytes();
        let inner = vec![Id.as_ref(), bump_vector.as_ref()];
        let outer = vec![inner.as_slice()];
        let transfer_context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token_account.to_account_info(),
                to: ctx.accounts.htlc_token_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
            outer.as_slice(),
        );
        anchor_spl::token::transfer(transfer_context, amount)?;

        htlc.dst_address = dst_address;
        htlc.dst_chain = dst_chain;
        htlc.dst_asset = dst_asset;
        htlc.src_asset = src_asset;
        htlc.sender = *ctx.accounts.sender.to_account_info().key;
        htlc.src_receiver = src_receiver;
        htlc.hashlock = hashlock;
        htlc.secret = [0u8; 32];
        htlc.amount = amount;
        htlc.timelock = timelock;
        htlc.reward = 0;
        htlc.reward_timelock = 0;
        htlc.token_contract = *ctx.accounts.token_contract.to_account_info().key;
        htlc.token_wallet = *ctx.accounts.htlc_token_account.to_account_info().key;
        htlc.claimed = 1;

        Ok(Id)
    }

    /// @dev Solver / Payer sets the reward for claiming the funds.
    /// @param reward the amount of the reward token.
    /// @param reward_timelock After this time the rewards can be claimed.
    pub fn lock_reward(
        ctx: Context<LockReward>,
        Id: [u8; 32],
        reward_timelock: u64,
        reward: u64,
        lock_bump: u8,
    ) -> Result<bool> {
        let clock = Clock::get().unwrap();
        let htlc = &mut ctx.accounts.htlc;

        require!(
            reward_timelock < htlc.timelock
                && reward_timelock > clock.unix_timestamp.try_into().unwrap(),
            HTLCError::InvalidRewardTimeLock
        );

        htlc.reward_timelock = reward_timelock;
        htlc.reward = reward;

        let bump_vector = lock_bump.to_le_bytes();
        let inner = vec![Id.as_ref(), bump_vector.as_ref()];
        let outer = vec![inner.as_slice()];
        let transfer_context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token_account.to_account_info(),
                to: ctx.accounts.htlc_token_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
            outer.as_slice(),
        );
        anchor_spl::token::transfer(transfer_context, reward)?;

        Ok(true)
    }

    /// @dev Called by the sender to add hashlock to the HTLC
    ///
    /// @param Id of the HTLC.
    /// @param hashlock to be added.
    pub fn add_lock(
        ctx: Context<AddLock>,
        Id: [u8; 32],
        hashlock: [u8; 32],
        timelock: u64,
    ) -> Result<[u8; 32]> {
        let clock = Clock::get().unwrap();
        let time: u64 = clock.unix_timestamp.try_into().unwrap();
        require!(timelock >= time + 900, HTLCError::InvalidTimeLock);

        let htlc = &mut ctx.accounts.htlc;

        msg!("Id: {:?}", hex::encode(Id));
        msg!("hashlock: {:?}", hex::encode(hashlock));
        msg!("timelock: {:?}", timelock);

        htlc.hashlock = hashlock;
        htlc.timelock = timelock;

        Ok(Id)
    }

    /// @dev Called by the src_receiver once they know the secret of the hashlock.
    /// This will transfer the locked funds to the HTLC's src_receiver's address.
    ///
    /// @param Id of the HTLC.
    /// @param secret sha256(secret) should equal the contract hashlock.
    pub fn redeem(
        ctx: Context<Redeem>,
        Id: [u8; 32],
        secret: [u8; 32],
        htlc_bump: u8,
    ) -> Result<bool> {
        let htlc = &mut ctx.accounts.htlc;
        let mut hasher = Sha256::new();
        hasher.update(secret.clone());
        let hash = hasher.finalize();
        require!([0u8; 32] != htlc.hashlock, HTLCError::HashlockNotSet);
        require!(hash == htlc.hashlock.into(), HTLCError::HashlockNoMatch);

        htlc.claimed = 3;
        htlc.secret = secret;
        if htlc.reward != 0 {
            // if redeem is called before the reward_timelock sender should get the reward back
            if htlc.reward_timelock > Clock::get().unwrap().unix_timestamp.try_into().unwrap() {
                transfer_htlc_reward_out(
                    ctx.accounts.sender.to_account_info(),
                    Id,
                    htlc.to_account_info(),
                    htlc_bump,
                    &mut ctx.accounts.htlc_token_account,
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.src_receiver_token_account.to_account_info(),
                    ctx.accounts.sender_token_account.to_account_info(),
                    ctx.accounts.htlc.amount,
                    ctx.accounts.htlc.reward,
                )?;
            } else {
                // if the caller is the receiver then they should get and the amount,
                // and the reward
                if ctx.accounts.user_signing.key() == ctx.accounts.src_receiver.key() {
                    transfer_htlc_out(
                        ctx.accounts.sender.to_account_info(),
                        Id,
                        htlc.to_account_info(),
                        htlc_bump,
                        &mut ctx.accounts.htlc_token_account,
                        ctx.accounts.token_program.to_account_info(),
                        ctx.accounts.src_receiver_token_account.to_account_info(),
                        ctx.accounts.htlc.amount + ctx.accounts.htlc.reward,
                    )?;
                } else {
                    transfer_htlc_reward_out(
                        ctx.accounts.sender.to_account_info(),
                        Id,
                        htlc.to_account_info(),
                        htlc_bump,
                        &mut ctx.accounts.htlc_token_account,
                        ctx.accounts.token_program.to_account_info(),
                        ctx.accounts.src_receiver_token_account.to_account_info(),
                        ctx.accounts.reward_token_account.to_account_info(),
                        ctx.accounts.htlc.amount,
                        ctx.accounts.htlc.reward,
                    )?;
                }
            }
        } else {
            // send the tokens to the receiver if the reward is set to zero
            transfer_htlc_out(
                ctx.accounts.sender.to_account_info(),
                Id,
                htlc.to_account_info(),
                htlc_bump,
                &mut ctx.accounts.htlc_token_account,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.src_receiver_token_account.to_account_info(),
                ctx.accounts.htlc.amount,
            )?;
        }

        Ok(true)
    }

    /// @dev Called by the sender if there was no redeem AND the time lock has
    /// expired. This will refund the contract amount.
    ///
    /// @param Id of the HTLC to refund from.
    pub fn refund(ctx: Context<Refund>, Id: [u8; 32], htlc_bump: u8) -> Result<bool> {
        let htlc = &mut ctx.accounts.htlc;

        htlc.claimed = 2;

        transfer_htlc_out(
            ctx.accounts.sender.to_account_info(),
            Id,
            htlc.to_account_info(),
            htlc_bump,
            &mut ctx.accounts.htlc_token_account,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.sender_token_account.to_account_info(),
            ctx.accounts.htlc.amount + ctx.accounts.htlc.reward,
        )?;

        Ok(true)
    }

    /// @dev Get HTLC details.
    /// @param Id of the HTLC.
    pub fn getDetails(ctx: Context<GetDetails>, Id: [u8; 32]) -> Result<HTLC> {
        let htlc = &ctx.accounts.htlc;

        msg!("dst_address: {:?}", htlc.dst_address.clone());
        msg!("dst_chain: {:?}", htlc.dst_chain.clone());
        msg!("dst_asset: {:?}", htlc.dst_asset.clone());
        msg!("src_asset: {:?}", htlc.src_asset);
        msg!("sender: {:?}", htlc.sender);
        msg!("src_receiver: {:?}", htlc.src_receiver);
        msg!("hashlock: {:?}", hex::encode(htlc.hashlock));
        msg!("secret: {:?}", hex::encode(htlc.secret.clone()));
        msg!("amount: {:?}", htlc.amount);
        msg!("timelock: {:?}", htlc.timelock);
        msg!("reward: {:?}", htlc.reward);
        msg!("reward_timelock: {:?}", htlc.reward_timelock);
        msg!("token_contract: {:?}", htlc.token_contract);
        msg!("token_wallet: {:?}", htlc.token_wallet);
        msg!("claimed: {:?}", htlc.claimed);

        Ok(HTLC {
            dst_address: htlc.dst_address.clone(),
            dst_chain: htlc.dst_chain.clone(),
            dst_asset: htlc.dst_asset.clone(),
            src_asset: htlc.src_asset.clone(),
            sender: htlc.sender,
            src_receiver: htlc.src_receiver,
            hashlock: htlc.hashlock,
            secret: htlc.secret.clone(),
            amount: htlc.amount,
            timelock: htlc.timelock,
            reward: htlc.reward,
            reward_timelock: htlc.reward_timelock,
            token_contract: htlc.token_contract,
            token_wallet: htlc.token_wallet,
            claimed: htlc.claimed,
        })
    }
}

#[account]
#[derive(Default)]
pub struct HTLC {
    /// @dev The address to recieve funds.
    pub dst_address: String,
    /// @dev The chain where funds will be received.
    pub dst_chain: String,
    /// @dev The type of the receiving asset.
    pub dst_asset: String,
    /// @dev The type of the sending asset.
    pub src_asset: String,
    /// @dev The creator of the HTLC.
    pub sender: Pubkey,
    /// @dev The recipient of the funds if conditions are met.
    pub src_receiver: Pubkey,
    /// @dev The hash of the secret required for redeem.
    pub hashlock: [u8; 32],
    /// @dev The secret required to redeem.
    pub secret: [u8; 32],
    /// @dev The amount of funds locked in the HTLC.
    pub amount: u64,
    /// @dev The timestamp after which the funds can be refunded.
    pub timelock: u64,
    /// @dev The amount of the reward in SPL token to be claimed.
    pub reward: u64,
    /// @dev The timestamp after which the reward can be claimed
    /// (if claimed before than the reward will be sent back to the Solver).
    pub reward_timelock: u64,
    /// @dev The SPL token contract address.
    pub token_contract: Pubkey,
    /// @dev The htlc_token_account address.
    pub token_wallet: Pubkey,
    /// @dev Indicates whether the funds were claimed (redeemed(3) or refunded(2)).
    pub claimed: u8,
}
/// @dev Commit context.
/// @param ID The Id of HTLC.
/// @param sender The sender of the funds.
/// @param htlc The PreHTLC to be created.
/// @param htlc_token_account The token account of the PreHTLC(where the funds will be stored).
/// @param token_contract The type of the token.
/// @param sender_token_account The token account of the sender.
#[derive(Accounts)]
#[instruction(Id: [u8;32], commit_bump: u8)]
pub struct Commit<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        init,
        payer = sender,
        space = size_of::<HTLC>() + 28,
        seeds = [
            Id.as_ref()
        ],
        bump,
    )]
    pub htlc: Box<Account<'info, HTLC>>,
    #[account(
        init,
        payer = sender,
        seeds = [
            b"htlc_token_account".as_ref(),
            Id.as_ref()
        ],
        bump,
        token::mint=token_contract,
        token::authority=htlc,
    )]
    pub htlc_token_account: Box<Account<'info, TokenAccount>>,
    pub token_contract: Account<'info, Mint>,
    #[account(
        mut,
        constraint=sender_token_account.owner == sender.key() @HTLCError::NotSender,
        constraint=sender_token_account.mint == token_contract.key() @HTLCError::NoToken,
    )]
    pub sender_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// @dev Lock context.
/// @param ID The Id of HTLC.
/// @param sender The sender of the funds.
/// @param htlc The HTLC to be created.
/// @param htlc_token_account The token account of the HTLC(where the funds will be stored).
/// @param token_contract The type of the token.
/// @param sender_token_account The token account of the sender.
#[derive(Accounts)]
#[instruction(Id: [u8; 32], lock_bump: u8)]
pub struct Lock<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        init,
        payer = sender,
        space = size_of::<HTLC>() + 28,
        // space = 256,
        seeds = [
            Id.as_ref()
        ],
        bump,
    )]
    pub htlc: Box<Account<'info, HTLC>>,
    #[account(
        init,
        payer = sender,
        seeds = [
            b"htlc_token_account".as_ref(),
            Id.as_ref()
        ],
        bump,
        token::mint=token_contract,
        token::authority=htlc,
    )]
    pub htlc_token_account: Box<Account<'info, TokenAccount>>,

    pub token_contract: Account<'info, Mint>,
    #[account(
        mut,
        constraint=sender_token_account.owner == sender.key() @HTLCError::NotSender,
        constraint=sender_token_account.mint == token_contract.key() @ HTLCError::NoToken,
    )]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
/// @dev LockReward context.
/// @param ID The Id of HTLC.
/// @param sender The sender of the reward.
/// @param htlc The HTLC to add the reward.
/// @param htlc_token_account The token account of the HTLC(where the reward will be stored).
/// @param token_contract The type of the token.
/// @param sender_token_account The token account of the sender.
#[derive(Accounts)]
#[instruction(Id: [u8; 32])]
pub struct LockReward<'info> {
    #[account(mut)]
    sender: Signer<'info>,
    #[account(
    mut,
    seeds = [
        Id.as_ref()
    ],
    bump,
    constraint = htlc.claimed == 1 @ HTLCError::AlreadyClaimed,
    has_one = sender @ HTLCError::UnauthorizedAccess,
    )]
    pub htlc: Box<Account<'info, HTLC>>,

    pub htlc_token_account: Box<Account<'info, TokenAccount>>,

    pub token_contract: Account<'info, Mint>,
    #[account(
        mut,
        constraint=sender_token_account.owner == sender.key() @HTLCError::NotSender,
        constraint=sender_token_account.mint == token_contract.key() @ HTLCError::NoToken,
    )]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}
/// @dev Redeem context.
/// @param ID The Id of HTLC.
/// @param user_signing The user calling the function.
/// @param sender The sender of the HTLC.
/// @param src_receiver The receiver of the HTLC.
/// @param token_contract The type of the token.
/// @param htlc The HTLC to redeem from.
/// @param htlc_token_account The token account of the HTLC.
/// @param sender_token_account The token account of the sender.
/// @param receiver_token_account The token account of the receiver.
/// @param reward_token_account The token account to send the reward.
#[derive(Accounts)]
#[instruction(Id: [u8;32], htlc_bump: u8)]
pub struct Redeem<'info> {
    #[account(mut)]
    user_signing: Signer<'info>,
    ///CHECK: The sender
    #[account(mut)]
    sender: UncheckedAccount<'info>,
    ///CHECK: The reciever
    pub src_receiver: UncheckedAccount<'info>,
    token_contract: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [
            Id.as_ref()
        ],
        bump,
        has_one = sender @HTLCError::NotSender,
        has_one = src_receiver @HTLCError::NotReciever,
        has_one = token_contract @HTLCError::NoToken,
        constraint = htlc.claimed == 1 @ HTLCError::AlreadyClaimed,
    )]
    pub htlc: Box<Account<'info, HTLC>>,
    #[account(
        mut,
        seeds = [
            b"htlc_token_account".as_ref(),
            Id.as_ref()
        ],
        bump,
    )]
    pub htlc_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint=sender_token_account.owner == sender.key() @HTLCError::NotSender,
        constraint=sender_token_account.mint == token_contract.key() @ HTLCError::NoToken,
    )]
    pub sender_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user_signing,
        associated_token::mint = token_contract,
        associated_token::authority = src_receiver,
    )]
    pub src_receiver_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user_signing,
        associated_token::mint = token_contract,
        associated_token::authority = user_signing,
    )]
    pub reward_token_account: Box<Account<'info, TokenAccount>>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    rent: Sysvar<'info, Rent>,
}
/// @dev Refund context.
/// @param ID The Id of HTLC.
/// @param user_signing The user calling the function.
/// @param sender The sender of the HTLC.
/// @param token_contract The type of the token.
/// @param htlc The HTLC to refund.
/// @param htlc_token_account The token account of the HTLC.
/// @param sender_token_account The token account of the sender.
#[derive(Accounts)]
#[instruction(Id: [u8;32], htlc_bump: u8)]
pub struct Refund<'info> {
    #[account(mut)]
    user_signing: Signer<'info>,

    #[account(mut,
    seeds = [
        //b"htlc",
        Id.as_ref()
    ],
    bump = htlc_bump,
    has_one = sender @HTLCError::NotSender,
    has_one = token_contract @HTLCError::NoToken,
    constraint = htlc.claimed == 1 @ HTLCError::AlreadyClaimed,
    constraint = Clock::get().unwrap().unix_timestamp >= htlc.timelock.try_into().unwrap() @ HTLCError::NotPastTimeLock,
    )]
    pub htlc: Box<Account<'info, HTLC>>,
    #[account(
        mut,
        seeds = [
            b"htlc_token_account".as_ref(),
            Id.as_ref()
        ],
        bump,
    )]
    pub htlc_token_account: Box<Account<'info, TokenAccount>>,

    ///CHECK: The sender
    #[account(mut)]
    sender: UncheckedAccount<'info>,
    token_contract: Account<'info, Mint>,

    #[account(
        mut,
        constraint=htlc.sender.key() == sender_token_account.owner @HTLCError::NotSender,
        constraint=sender_token_account.mint == token_contract.key() @HTLCError::NoToken,)]
    pub sender_token_account: Account<'info, TokenAccount>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}
/// @dev AddLock context.
/// @param ID The Id of HTLC.
/// @param sender The sender of the HTLC.
/// @param payer The Payer of the transaction.
/// @param htlc The HTLC to add the hashlock.
#[derive(Accounts)]
#[instruction(Id: [u8;32])]
pub struct AddLock<'info> {
    sender: Signer<'info>,
    #[account(mut)]
    payer: Signer<'info>,
    #[account(mut,
    seeds = [
        Id.as_ref()
    ],
    bump,
    constraint = htlc.claimed == 1 @ HTLCError::AlreadyClaimed,
    constraint = htlc.sender == sender.key() @ HTLCError::UnauthorizedAccess,
    constraint = htlc.hashlock == [0u8;32] @ HTLCError::HashlockAlreadySet,
    )]
    pub htlc: Box<Account<'info, HTLC>>,

    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}
/// @dev GetDetails context.
/// @param ID The Id of HTLC.
/// @param htlc The HTLC.
#[derive(Accounts)]
#[instruction(Id: [u8;32])]
pub struct GetDetails<'info> {
    #[account(
        seeds = [
            Id.as_ref()
        ],
        bump,
    )]
    pub htlc: Box<Account<'info, HTLC>>,
}
#[error_code]
pub enum HTLCError {
    #[msg("Invalid TimeLock.")]
    InvalidTimeLock,
    #[msg("Not Past TimeLock.")]
    NotPastTimeLock,
    #[msg("Invalid Reward TimeLock.")]
    InvalidRewardTimeLock,
    #[msg("Hashlock Is Not Set.")]
    HashlockNotSet,
    #[msg("Does Not Match the Hashlock.")]
    HashlockNoMatch,
    #[msg("Hashlock Already Set.")]
    HashlockAlreadySet,
    #[msg("Funds Are Alredy Claimed.")]
    AlreadyClaimed,
    #[msg("Funds Can Not Be Zero.")]
    FundsNotSent,
    #[msg("Unauthorized Access.")]
    UnauthorizedAccess,
    #[msg("Not The Owner.")]
    NotOwner,
    #[msg("Not The Sender.")]
    NotSender,
    #[msg("Not The Reciever.")]
    NotReciever,
    #[msg("Wrong Token.")]
    NoToken,
}
