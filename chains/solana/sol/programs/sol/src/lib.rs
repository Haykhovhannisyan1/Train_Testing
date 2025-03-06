//   _____ ____      _    ___ _   _      ____  ____   ___ _____ ___   ____ ___  _
//  |_   _|  _ \    / \  |_ _| \ | |    |  _ \|  _ \ / _ \_   _/ _ \ / ___/ _ \| |
//    | | | |_) |  / _ \  | ||  \| |    | |_) | |_) | | | || || | | | |  | | | | |
//    | | |  _ <  / ___ \ | || |\  |    |  __/|  _ <| |_| || || |_| | |__| |_| | |___
//    |_| |_| \_\/_/   \_\___|_| \_|    |_|   |_| \_\\___/ |_| \___/ \____\___/|_____|

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use sha2::{Digest, Sha256};
use std::mem::size_of;

declare_id!("Erxy5jJoEbqrWVVyynH47pwzcthv4mpN2qELBofx9gcz");
/// @title Pre Hashed Timelock Contracts (PHTLCs) on Solana.
///
/// This contract provides a way to create and keep PHTLCs for Solana.
///
/// Protocol:
///
///  1) commit(src_receiver, timelock, amount) - a
///      sender calls this to create a new HTLC
///      for a given amount. A [u8; 32] Id is returned.
///  2) lock(src_receiver, hashlock, timelock, amount) - a
///      sender calls this to create a new HTLC
///      for a given amount. A [u8; 32] Id is returned.
///  3) addLock(Id, hashlock, timelock) - the sender calls this function
///      to add the hashlock to HTLC.
///  4) redeem(Id, secret) - once the src_receiver knows the secret of
///      the hashlock hash they can claim the sol with this function
///  5) refund(Id) - after timelock has expired and if the src_receiver did not
///      redeem the sol the sender / creator of the HTLC can get their sol
///      back with this function.
#[program]
pub mod native_htlc {
    use super::*;

    /// @dev Sender / Payer sets up a new pre-hash time lock contract depositing the
    /// funds and providing the src_receiver and terms.
    /// @param src_receiver src_receiver of the funds.
    /// @param timelock UNIX epoch seconds time that the lock expires at.
    ///                  Refunds can be made after this time.
    /// @return Id of the new HTLC. This is needed for subsequent calls.
    pub fn commit(
        ctx: Context<Commit>,
        Id: [u8; 32],
        hopChains: Vec<String>,
        hopAssets: Vec<String>,
        hopAddresses: Vec<String>,
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
        require!(
            timelock > clock.unix_timestamp.try_into().unwrap(),
            HTLCError::NotFutureTimeLock
        );
        require!(amount != 0, HTLCError::FundsNotSent);
        let htlc = &mut ctx.accounts.htlc;

        htlc.dst_address = dst_address;
        htlc.dst_chain = dst_chain;
        htlc.dst_asset = dst_asset;
        htlc.src_asset = src_asset;
        htlc.sender = *ctx.accounts.sender.to_account_info().key;
        htlc.src_receiver = src_receiver;
        htlc.hashlock = [0u8; 32];
        htlc.amount = amount;
        htlc.timelock = timelock;
        htlc.reward = 0;
        htlc.reward_timelock = 0;
        htlc.claimed = 1;
        htlc.secret = [0u8; 32];

        let bump_vector = commit_bump.to_le_bytes();
        let inner = vec![Id.as_ref(), bump_vector.as_ref()];
        let outer = vec![inner.as_slice()];

        let transfer_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.sender.to_account_info(),
                to: htlc.to_account_info(),
            },
            outer.as_slice(),
        );
        system_program::transfer(transfer_context, amount)?;
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
        amount: u64,
        dst_chain: String,
        dst_address: String,
        dst_asset: String,
        src_asset: String,
        src_receiver: Pubkey,
        lock_bump: u8,
    ) -> Result<[u8; 32]> {
        let clock = Clock::get().unwrap();
        require!(
            timelock > clock.unix_timestamp.try_into().unwrap(),
            HTLCError::NotFutureTimeLock
        );
        require!(amount != 0, HTLCError::FundsNotSent);

        let htlc = &mut ctx.accounts.htlc;

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
        htlc.claimed = 1;

        let bump_vector = lock_bump.to_le_bytes();
        let inner = vec![Id.as_ref(), bump_vector.as_ref()];
        let outer = vec![inner.as_slice()];
        let transfer_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.sender.to_account_info(),
                to: htlc.to_account_info(),
            },
            outer.as_slice(),
        );
        system_program::transfer(transfer_context, amount)?;

        Ok(Id)
    }
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
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.sender.to_account_info(),
                to: htlc.to_account_info(),
            },
            outer.as_slice(),
        );
        system_program::transfer(transfer_context, reward)?;

        Ok(true)
    }

    /// @dev Called by the sender to add hashlock to the HTLC
    ///
    /// @param Id of the HTLC to addLock.
    /// @param hashlock of the HTLC to be locked.
    pub fn add_lock(
        ctx: Context<AddLock>,
        Id: [u8; 32],
        hashlock: [u8; 32],
        timelock: u64,
    ) -> Result<[u8; 32]> {
        let clock = Clock::get().unwrap();
        require!(
            timelock > clock.unix_timestamp.try_into().unwrap(),
            HTLCError::NotFutureTimeLock
        );

        let htlc = &mut ctx.accounts.htlc;
        htlc.hashlock = hashlock;
        htlc.timelock = timelock;

        Ok(Id)
    }

    /// @dev Called by the src_receiver once they know the secret of the hashlock.
    /// This will transfer the locked funds to the HTLC's src_receiver's address.
    ///
    /// @param Id of the HTLC.
    /// @param secret sha256(secret) should equal the contract hashlock.
    pub fn redeem(ctx: Context<Redeem>, Id: [u8; 32], secret: [u8; 32]) -> Result<bool> {
        let htlc = &mut ctx.accounts.htlc;
        let mut hasher = Sha256::new();
        hasher.update(secret);
        let hash = hasher.finalize();
        require!([0u8; 32] != htlc.hashlock, HTLCError::HashlockNotSet);
        require!(hash == htlc.hashlock.into(), HTLCError::HashlockNoMatch);

        htlc.claimed = 3;
        htlc.secret = secret;

        let amount = htlc.amount;
        let reward = htlc.reward;

        if htlc.reward != 0 {
            // if redeem is called before the reward_timelock sender should get the reward back
            if htlc.reward_timelock > Clock::get().unwrap().unix_timestamp.try_into().unwrap() {
                htlc.sub_lamports(amount + reward)?;
                ctx.accounts.src_receiver.add_lamports(amount)?;
                ctx.accounts.sender.add_lamports(reward)?;
            } else {
                // if the caller is the receiver then they should get and the amount,
                // and the reward
                if ctx.accounts.user_signing.key() == ctx.accounts.src_receiver.key() {
                    htlc.sub_lamports(amount + reward)?;
                    ctx.accounts.src_receiver.add_lamports(amount + reward)?;
                } else {
                    htlc.sub_lamports(amount + reward)?;
                    ctx.accounts.src_receiver.add_lamports(amount)?;
                    ctx.accounts.user_signing.add_lamports(reward)?;
                }
            }
        } else {
            // send the tokens to the receiver if the reward is set to zero
            htlc.sub_lamports(amount)?;
            ctx.accounts.src_receiver.add_lamports(amount)?;
        }

        Ok(true)
    }

    /// @dev Called by the sender if there was no redeem AND the time lock has
    /// expired. This will refund the contract amount.
    ///
    /// @param Id of the HTLC to refund from.
    pub fn refund(ctx: Context<Refund>, Id: [u8; 32]) -> Result<bool> {
        let htlc = &mut ctx.accounts.htlc;

        htlc.claimed = 2;

        let amount = htlc.amount;
        let reward = htlc.reward;

        htlc.sub_lamports(amount + reward)?;
        ctx.accounts.sender.add_lamports(amount + reward)?;

        Ok(true)
    }

    /// @dev Get HTLC details.
    /// @param Id of the HTLC.
    pub fn getDetails(ctx: Context<GetDetails>, Id: [u8; 32]) -> Result<HTLC> {
        let htlc = &ctx.accounts.htlc;
        msg!("hashlcok: {:?}", htlc.hashlock);
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
            reward: htlc.reward,
            timelock: htlc.timelock,
            reward_timelock: htlc.reward_timelock,
            claimed: htlc.claimed,
        })
    }
}
#[account]
#[derive(Default)]
pub struct HTLC {
    pub dst_address: String,
    pub dst_chain: String,
    pub dst_asset: String,
    pub src_asset: String,
    pub sender: Pubkey,
    pub src_receiver: Pubkey,
    pub hashlock: [u8; 32],
    pub secret: [u8; 32],
    pub amount: u64,
    pub reward: u64,
    pub timelock: u64,
    pub reward_timelock: u64,
    pub claimed: u8,
}
#[derive(Accounts)]
#[instruction(Id: [u8; 32], commit_bump: u8)]
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

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(Id: [u8; 32], lock_bump: u8)]
pub struct Lock<'info> {
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

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

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

    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(Id: [u8; 32])]
pub struct Redeem<'info> {
    #[account(mut)]
    user_signing: Signer<'info>,
    ///CHECK: The reciever
    #[account(mut)]
    sender: UncheckedAccount<'info>,
    ///CHECK: The reciever
    #[account(mut)]
    pub src_receiver: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            Id.as_ref()
        ],
        bump,
        has_one = sender @HTLCError::NotSender,
        has_one = src_receiver @HTLCError::NotReciever,
        constraint = htlc.claimed == 1 @ HTLCError::AlreadyClaimed,
    )]
    pub htlc: Box<Account<'info, HTLC>>,

    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(Id: [u8; 32])]
pub struct Refund<'info> {
    #[account(mut)]
    user_signing: Signer<'info>,

    #[account(mut,
    seeds = [
        Id.as_ref()
    ],
    bump,
    has_one = sender @HTLCError::NotSender,
    constraint = htlc.claimed == 1 @ HTLCError::AlreadyClaimed,
    constraint = Clock::get().unwrap().unix_timestamp >= htlc.timelock.try_into().unwrap() @ HTLCError::NotPastTimeLock,
    )]
    pub htlc: Box<Account<'info, HTLC>>,

    ///CHECK: The sender
    #[account(mut)]
    sender: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(Id: [u8; 32])]
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

#[derive(Accounts)]
#[instruction(Id: [u8; 32])]
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
    #[msg("Not Future TimeLock.")]
    NotFutureTimeLock,
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
}
