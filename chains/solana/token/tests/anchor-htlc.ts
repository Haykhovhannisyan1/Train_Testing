import assert from "assert";
import * as anchor from "@coral-xyz/anchor";
import { randomBytes, createHash } from "crypto";
import * as spl from '@solana/spl-token';
import * as ed from '@noble/ed25519';
import { AnchorHtlc } from '../target/types/anchor_htlc';

interface PDAParameters {
  htlcTokenAccount: anchor.web3.PublicKey;
  htlc: anchor.web3.PublicKey;
  htlcBump: number;
}

describe("HTLC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AnchorHtlc as anchor.Program<AnchorHtlc>;
  const wallet = provider.wallet as anchor.Wallet;

  const SECRET = randomBytes(32);
  const HASHLOCK = createHash("sha256").update(SECRET).digest();
  const AMOUNT = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
  const REWARD = 0.001 * anchor.web3.LAMPORTS_PER_SOL;
  const DSTCHAIN = "STARKNET_SEPOLIA";
  const DSTADDRESS = "0x021b6a2ff227f1c71cc6536e7b9e8ecd0d5599b3a934279011e2f2b923d3a782";
  const SRCASSET = "ETH";
  const DSTASSET = "ETH";
  const HOPCHAINS = [DSTCHAIN];
  const HOPASSETS = [DSTASSET];
  const HOPADDRESSES = [DSTADDRESS];


  let signature: Uint8Array;
  let tokenMint: anchor.web3.PublicKey;
  let walletTokenAccount: anchor.web3.PublicKey;
  let bob: anchor.web3.Keypair;

  const getPdaParams = async (
    Id: Buffer,
  ): Promise<PDAParameters> => {
    let [htlc, htlcBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Id],
      program.programId
    );
    let [htlcTokenAccount, htlcTokenbump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("htlc_token_account"), Id],
      program.programId
    );

    return {
      htlcTokenAccount,
      htlc,
      htlcBump,
    };
  };

  const createMint = async (): Promise<anchor.web3.PublicKey> => {
    const tokenMint = new anchor.web3.Keypair();
    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption(spl.MintLayout.span);
    let tx = new anchor.web3.Transaction();

    // Allocate mint
    tx.add(
      anchor.web3.SystemProgram.createAccount({
        programId: spl.TOKEN_PROGRAM_ID,
        space: spl.MintLayout.span,
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: tokenMint.publicKey,
        lamports: lamportsForMint,
      })
    );
    // Allocate wallet account
    tx.add(
      spl.createInitializeMintInstruction(tokenMint.publicKey, 6, provider.wallet.publicKey, provider.wallet.publicKey)
    );
    const signature = await provider.sendAndConfirm(tx, [tokenMint]);

    // console.log(`[${tokenMint.publicKey}] Created new token mint at ${signature}`);
    return tokenMint.publicKey;
  };

  const createUserAndAssociatedWallet = async (
    mint?: anchor.web3.PublicKey
  ): Promise<[anchor.web3.Keypair, anchor.web3.PublicKey | undefined]> => {
    const user = new anchor.web3.Keypair();
    let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined = undefined;

    // Fund user with SOL
    let txFund = new anchor.web3.Transaction();
    txFund.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: user.publicKey,
        lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    const sigTxFund = await provider.sendAndConfirm(txFund);
    // console.log(`[${user.publicKey.toBase58()}] Funded new account with 0.005 SOL: ${sigTxFund}`);

    if (mint) {
      // Create a token account for the user and mint some tokens
      userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(mint, user.publicKey);
      const txFundTokenAccount = new anchor.web3.Transaction();
      txFundTokenAccount.add(
        spl.createAssociatedTokenAccountInstruction(
          provider.wallet.publicKey,
          userAssociatedTokenAccount,
          user.publicKey,
          mint
        )
      );
      txFundTokenAccount.add(spl.createMintToInstruction(mint, userAssociatedTokenAccount, provider.wallet.publicKey, 13370000000));
      const txFundTokenSig = await provider.sendAndConfirm(txFundTokenAccount);
      // console.log(`[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`);
    }
    return [user, userAssociatedTokenAccount];
  };

  const mintTokensForUser = async (
    user: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey
  ): Promise<anchor.web3.PublicKey> => {
    let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined = undefined;

    // Create a token account for the wallet and mint some tokens
    userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(mint, user);
    const txFundTokenAccount = new anchor.web3.Transaction();
    txFundTokenAccount.add(
      spl.createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        userAssociatedTokenAccount,
        user,
        mint
      )
    );
    txFundTokenAccount.add(spl.createMintToInstruction(mint, userAssociatedTokenAccount, provider.wallet.publicKey, 1337000000));
    const txFundTokenSig = await provider.sendAndConfirm(txFundTokenAccount);
    // console.log(`[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`);

    return userAssociatedTokenAccount;
  };

  const readAccount = async (
    accountPublicKey: anchor.web3.PublicKey,
    provider: anchor.AnchorProvider
  ): Promise<[spl.RawAccount, string]> => {
    const tokenInfo = await provider.connection.getAccountInfo(accountPublicKey);
    const data = Buffer.from(tokenInfo.data);
    const accountInfo = spl.AccountLayout.decode(data);
    // Convert amount from buffer to bigint, then to anchor.BN
    const amount = accountInfo.amount;
    return [accountInfo, amount.toString()];
  };

  const createPHTLC = async (Id: Buffer, amount: anchor.BN, timelock: anchor.BN) => {
    const pda = await getPdaParams(Id);
    const commitTx = await program.methods
      .commit(Array.from(Id), HOPCHAINS, HOPASSETS, HOPADDRESSES, DSTCHAIN, DSTASSET, DSTADDRESS, SRCASSET, bob.publicKey, timelock, amount, pda.htlcBump)
      .accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: walletTokenAccount
      })
      .signers([wallet.payer])
      .rpc();
  }

  const createHTLC = async (Id: Buffer, rewardTimelock: anchor.BN, timelock: anchor.BN, amount: anchor.BN, hashlock: number[]) => {
    const htlc_pda = await getPdaParams(Id);

    const lockTx = await program.methods
      .lock(Array.from(Id), hashlock, timelock, DSTCHAIN, DSTADDRESS, DSTASSET, SRCASSET, bob.publicKey, amount, htlc_pda.htlcBump)
      .accountsPartial({
        sender: wallet.publicKey,
        htlc: htlc_pda.htlc,
        htlcTokenAccount: htlc_pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: walletTokenAccount
      }).transaction();

    const rewardTx = await program.methods
      .lockReward(Array.from(Id), rewardTimelock, new anchor.BN(REWARD), htlc_pda.htlcBump)
      .accountsPartial({
        sender: wallet.publicKey,
        htlc: htlc_pda.htlc,
        htlcTokenAccount: htlc_pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: walletTokenAccount
      }).transaction();

    let lock_with_rewardtx = new anchor.web3.Transaction();
    lock_with_rewardtx.add(lockTx);
    lock_with_rewardtx.add(rewardTx);

    await anchor.web3.sendAndConfirmTransaction(anchor.getProvider().connection, lock_with_rewardtx, [wallet.payer]);
  }

  const signHTLC = async (Id: Buffer, hashlock: Buffer, timelock: anchor.BN): Promise<[Uint8Array, Uint8Array]> => {
    const TIMELOCK_LE = Buffer.alloc(8);
    TIMELOCK_LE.writeBigUInt64LE(BigInt(timelock.toString()));
    const MSG = createHash("sha256").update(Id).update(hashlock).update(Buffer.from(TIMELOCK_LE)).digest();

    const signingDomain = Buffer.from("\xffsolana offchain", "ascii")
    const headerVersion = Buffer.from([0]);
    const applicationDomain = Buffer.alloc(32);
    applicationDomain.write("Train");
    const messageFormat = Buffer.from([0]);
    const signerCount = Buffer.from([1]);
    const signerPublicKey = wallet.publicKey.toBytes();

    const messageLength = Buffer.alloc(2);
    messageLength.writeUInt16LE(MSG.length, 0);

    // Construct preamble
    const rawMessage = Buffer.concat([
      signingDomain,
      headerVersion,
      applicationDomain,
      messageFormat,
      signerCount,
      signerPublicKey,
      messageLength,
      MSG,
    ]);
    const hexString = rawMessage.toString('hex');
    const finalMessage = new TextEncoder().encode(hexString);

    let wallet_payer = wallet.payer;
    let sk = wallet_payer.secretKey;
    signature = await ed.sign(finalMessage, sk.slice(0, 32));
    let verified = await ed.verify(signature, finalMessage, wallet_payer.publicKey.toBytes());
    return [finalMessage, signature]
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  beforeEach(async () => {
    tokenMint = await createMint();
    walletTokenAccount = await mintTokensForUser(wallet.publicKey, tokenMint);
    let bobTokenAccount;
    [bob, bobTokenAccount] = await createUserAndAssociatedWallet();
    bobTokenAccount = await mintTokensForUser(bob.publicKey, tokenMint);
  });

  /// Can't redeem if the (Pre)HTLC with the given Id does not exist.
  const T0_1 = async (Id: Buffer, bobTokenAccount) => {
    const secret = randomBytes(32);
    const pda = await getPdaParams(Id);

    const redeemTx = await program.methods.redeem(Array.from(Id), Array.from(secret), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        sender: wallet.publicKey,
        srcReceiver: bob.publicKey,
        tokenContract: tokenMint,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        senderTokenAccount: walletTokenAccount,
        srcReceiverTokenAccount: bobTokenAccount,
        rewardTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc().catch(e => console.error(e));

  }

  /// Can't refund if the (Pre)HTLC with the given Id does not exist.
  const T0_2 = async (Id: Buffer) => {
    const pda = await getPdaParams(Id);

    const refundTx = await program.methods.refund(Array.from(Id), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        sender: wallet.publicKey,
        tokenContract: tokenMint,
        senderTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc().catch(e => console.error(e));

  }

  /// Can't add lock if the (Pre)HTLC with the given Id does not exist.
  const T0_3 = async (Id: Buffer, timelock) => {
    const hashlock = randomBytes(32);
    const pda = await getPdaParams(Id);

    const AddLock = await program.methods.addLock(Array.from(Id), Array.from(hashlock), timelock).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([wallet.payer])
      .rpc().catch(e => console.error(e));

  }

  /// Can't add lock sign if the (Pre)HTLC with the given Id does not exist.
  const T0_4 = async (Id: Buffer, timelock) => {
    const hashlock = randomBytes(32);
    const pda = await getPdaParams(Id);


    const [finalMessage, signature] = await signHTLC(Id, hashlock, timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));
  }

  /// Tests with not existing HTLCs.
  /// There is no (Pre)HTLC with that IDs.
  it("T0", async () => {
    const bobTokenAccount = await spl.getAssociatedTokenAddress(
      tokenMint,
      bob.publicKey
    )
    const Id = randomBytes(32);
    const TIME = (new Date().getTime() + 970000) / 1000;

    await T0_1(Id, bobTokenAccount)
    await T0_2(Id)
    await T0_3(Id, new anchor.BN(TIME))
    await T0_4(Id, new anchor.BN(TIME))
  });

  /// Can redeem with the correct secret.
  const T1_1 = async (bobTokenAccount) => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    const pda = await getPdaParams(Id);
    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));

    const redeemTx = await program.methods.redeem(Array.from(Id), Array.from(secret), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        sender: wallet.publicKey,
        srcReceiver: bob.publicKey,
        tokenContract: tokenMint,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        senderTokenAccount: walletTokenAccount,
        srcReceiverTokenAccount: bobTokenAccount,
        rewardTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc();

  }

  /// Can't redeem with wrong secret.
  const T1_2 = async (bobTokenAccount) => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const wrong_secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    const pda = await getPdaParams(Id);
    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));
    const redeemTx = await program.methods.redeem(Array.from(Id), Array.from(wrong_secret), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        sender: wallet.publicKey,
        srcReceiver: bob.publicKey,
        tokenContract: tokenMint,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        senderTokenAccount: walletTokenAccount,
        srcReceiverTokenAccount: bobTokenAccount,
        rewardTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc().catch(e => console.error(e));

  }
  /// Tests for redeeming HTLC.
  it("T1", async () => {
    let bobTokenAccount
    [bob, bobTokenAccount] = await createUserAndAssociatedWallet();
    bobTokenAccount = await mintTokensForUser(bob.publicKey, tokenMint);

    await T1_1(bobTokenAccount)
    await T1_2(bobTokenAccount)
  });

  /// Tests for already redeemed HTLCs.
  it("T2", async () => {

    const bobTokenAccount = await spl.getAssociatedTokenAddress(
      tokenMint,
      bob.publicKey
    )

    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    const pda = await getPdaParams(Id);
    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));

    const redeemTx = await program.methods.redeem(Array.from(Id), Array.from(secret), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        sender: wallet.publicKey,
        srcReceiver: bob.publicKey,
        tokenContract: tokenMint,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        senderTokenAccount: walletTokenAccount,
        srcReceiverTokenAccount: bobTokenAccount,
        rewardTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc();

    await T0_1(Id, bobTokenAccount)
    await T0_2(Id)
    await T0_3(Id, new anchor.BN(time))
    await T0_4(Id, new anchor.BN(time))
  });



  // TODO: add 30 minutes wait.
  /// Can refund if the timelock passed.
  const T3_1 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    const pda = await getPdaParams(Id);
    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));

    const refundTx = await program.methods.refund(Array.from(Id), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        sender: wallet.publicKey,
        tokenContract: tokenMint,
        senderTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc();

  }

  /// Can't refund if timelock did not pass.
  const T3_2 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const wrong_secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    const pda = await getPdaParams(Id);
    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));
    await wait(20000);
    const refundTx = await program.methods.refund(Array.from(Id), pda.htlcBump).
      accountsPartial({
        userSigning: wallet.publicKey,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        sender: wallet.publicKey,
        tokenContract: tokenMint,
        senderTokenAccount: walletTokenAccount,
      })
      .signers([wallet.payer])
      .rpc();


  }
  /// Tests for refunding HTLC.
  // it("T3", async () => {
  //   await T3_1()
  //   await T3_2()
  // });


  /// Tests for already refunded HTLCs.
  // it("T4", async () => {

  //   const bobTokenAccount = await spl.getAssociatedTokenAddress(
  //     tokenMint,
  //     bob.publicKey
  //   )

  //   const Id = randomBytes(32);
  //   const secret = randomBytes(32);
  //   const hashlock = createHash("sha256").update(secret).digest();
  //   const time = (new Date().getTime() + 1000000) / 1000;
  //   const rtime = (new Date().getTime() + 900000) / 1000;

  //   const pda = await getPdaParams(Id);
  //   await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));

  //   await wait(1200000);
  //   const refundTx = await program.methods.refund(Array.from(Id), pda.htlcBump).
  //     accountsPartial({
  //       userSigning: wallet.publicKey,
  //       htlc: pda.htlc,
  //       htlcTokenAccount: pda.htlcTokenAccount,
  //       sender: wallet.publicKey,
  //       tokenContract: tokenMint,
  //       senderTokenAccount: walletTokenAccount,
  //     })
  //     .signers([wallet.payer])
  //     .rpc();


  //   await T0_1(Id, bobTokenAccount)
  //   await T0_2(Id)
  //   await T0_3(Id, new anchor.BN(time))
  //   await T0_4(Id, new anchor.BN(time))
  // });

  /// Can't create PreHTLC with already existing ID.
  const T5_1 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time));
    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time)).catch(e => console.error(e));

  }

  /// Can't create HTLC with already existing ID.
  const T5_2 = async () => {

    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock));
    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock)).catch(e => console.error(e));
  }

  /// Tests for already created (Pre)HTLCs
  it("T5", async () => {

    await T5_1()
    await T5_2()
  });


  /// Can't create PreHTLC with not positive amount.
  const T6_1 = async () => {
    const Id = randomBytes(32);
    const amount = 0 * anchor.web3.LAMPORTS_PER_SOL;
    const time = (new Date().getTime() + 1000000) / 1000;

    await createPHTLC(Id, new anchor.BN(amount), new anchor.BN(time)).catch(e => console.error(e));
  }

  /// Can't create HTLC with not positive amount.
  const T6_2 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;
    const amount = 0 * anchor.web3.LAMPORTS_PER_SOL;

    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(amount), Array.from(hashlock)).catch(e => console.error(e));
  }

  /// Tests for not positive amount (Pre)HTLCs.
  it("T6", async () => {

    await T6_1()
    await T6_2()
  });

  /// Can't create PreHTLC without enough balance.
  const T7_1 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const bobTokenAccount = await spl.getAssociatedTokenAddress(
      tokenMint,
      bob.publicKey
    )

    const pda = await getPdaParams(Id);
    const commitTx = await program.methods
      .commit(Array.from(Id), HOPCHAINS, HOPASSETS, HOPADDRESSES, DSTCHAIN, DSTASSET, DSTADDRESS, SRCASSET, bob.publicKey, new anchor.BN(time), new anchor.BN(AMOUNT), pda.htlcBump)
      .accountsPartial({
        sender: bob.publicKey,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: bobTokenAccount
      })
      .signers([bob])
      .rpc().catch(e => console.error(e));
  }

  /// Can't create HTLC without enough balance.
  const T7_2 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;
    const bobTokenAccount = await spl.getAssociatedTokenAddress(
      tokenMint,
      bob.publicKey
    )

    const htlc_pda = await getPdaParams(Id);

    const lockTx = await program.methods
      .lock(Array.from(Id), Array.from(hashlock), new anchor.BN(time), DSTCHAIN, DSTADDRESS, DSTASSET, SRCASSET, bob.publicKey, new anchor.BN(AMOUNT), htlc_pda.htlcBump)
      .accountsPartial({
        sender: bob.publicKey,
        htlc: htlc_pda.htlc,
        htlcTokenAccount: htlc_pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: bobTokenAccount
      }).transaction();
    const rewardTx = await program.methods
      .lockReward(Array.from(Id), new anchor.BN(rtime), new anchor.BN(REWARD), htlc_pda.htlcBump)
      .accountsPartial({
        sender: bob.publicKey,
        htlc: htlc_pda.htlc,
        htlcTokenAccount: htlc_pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: bobTokenAccount
      }).transaction();

    let lock_with_rewardtx = new anchor.web3.Transaction();
    lock_with_rewardtx.add(lockTx);
    lock_with_rewardtx.add(rewardTx);

    await anchor.web3.sendAndConfirmTransaction(anchor.getProvider().connection, lock_with_rewardtx, [bob]).catch(e => console.error(e));
  }

  /// Tests for (Pre)HTLCs without enough balance.
  it("T7", async () => {

    await T7_1()
    await T7_2()
  });


  /// There is no allowance in Solana.
  it("T8", async () => { });

  /// Can't create PreHTLC with wrong timelock.
  const T9_1 = async () => {
    const Id = randomBytes(32);
    // not future timelock
    const time = (new Date().getTime() - 1000000) / 1000;

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time)).catch(e => console.error(e));
  }

  /// Can't create HTLC with not positive amount.
  const T9_2 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    // not future timelock
    const time = (new Date().getTime() - 1000000) / 1000;
    const rtime = (new Date().getTime() + 900000) / 1000;

    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock)).catch(e => console.error(e));
  }

  /// Can't create HTLC with wrong timelock.
  it("T9", async () => {

    await T9_1()
    await T9_2()
  });

  /// Can't create HTLC with not future reward timelock.
  const T10_1 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    // not future timelock
    const rtime = (new Date().getTime() - 900000) / 1000;

    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock)).catch(e => console.error(e));
  }

  /// Can't create HTLC with bigger reward timelock.
  const T10_2 = async () => {
    const Id = randomBytes(32);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const time = (new Date().getTime() + 1000000) / 1000;
    // Reward timelock is bigger than HTLC timelock
    const rtime = (new Date().getTime() + 1900000) / 1000;

    await createHTLC(Id, new anchor.BN(rtime), new anchor.BN(time), new anchor.BN(AMOUNT), Array.from(hashlock)).catch(e => console.error(e));
  }

  /// Tests for HTLCs with wrong reward timelocks.
  it("T10", async () => {

    await T10_1()
    await T10_2()
  });

  /// Sender can add lock to PreHTLC.
  const T11_1 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time)).catch(e => console.error(e));

    const AddLock = await program.methods.addLock(Array.from(Id), Array.from(HASHLOCK), new anchor.BN(time)).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([wallet.payer])
      .rpc();
  }

  /// Other users can't add lock to PreHTLC.
  const T11_2 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time)).catch(e => console.error(e));

    const AddLock = await program.methods.addLock(Array.from(Id), Array.from(HASHLOCK), new anchor.BN(time)).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([bob])
      .rpc().catch(e => console.error(e));
  }


  /// Can't add lock if hashlock is already set.
  const T11_3 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time)).catch(e => console.error(e));

    const AddLockTx1 = await program.methods.addLock(Array.from(Id), Array.from(HASHLOCK), new anchor.BN(time)).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([wallet.payer])
      .rpc();

    const AddLockTx2 = await program.methods.addLock(Array.from(Id), Array.from(HASHLOCK), new anchor.BN(time)).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([wallet.payer])
      .rpc().catch(e => console.error(e));
  }

  /// Can't add lock with wrong timelock.
  const T11_4 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time)).catch(e => console.error(e));
    // not future timelock
    const wrong_time = (new Date().getTime() - 1000000) / 1000;
    const AddLockTx1 = await program.methods.addLock(Array.from(Id), Array.from(HASHLOCK), new anchor.BN(wrong_time)).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([wallet.payer])
      .rpc().catch(e => console.error(e));
  }


  /// Tests for add Lock function.
  it("T11", async () => {

    await T11_1()
    await T11_2()
    await T11_3()
    await T11_4()
  });



  /// Can add lock with correct signature.
  const T12_1 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), timelock)

    const [finalMessage, signature] = await signHTLC(Id, hashlock, timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize());
  }

  /// Can't add lock signature if hashlock is already set.
  const T12_2 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), new anchor.BN(time))

    const AddLock = await program.methods.addLock(Array.from(Id), Array.from(HASHLOCK), new anchor.BN(time)).
      accountsPartial({
        sender: wallet.publicKey,
        htlc: pda.htlc,
      })
      .signers([wallet.payer])
      .rpc()

    const [finalMessage, signature] = await signHTLC(Id, hashlock, timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));
  }


  /// Can't add lock signature with wrong timelock.
  const T12_3 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), timelock)
    const wrong_time = (new Date().getTime() - 1000000) / 1000;
    const wrong_timelock = new anchor.BN(wrong_time);
    const [finalMessage, signature] = await signHTLC(Id, hashlock, wrong_timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), wrong_timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));
  }

  /// Can't add lock signature if signed with different ID.
  const T12_4 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), timelock)

    const diff_Id = randomBytes(32);
    const [finalMessage, signature] = await signHTLC(diff_Id, hashlock, timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));
  }

  /// Can't add lock signature if signed with different hashlock.
  const T12_5 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), timelock);

    const diff_hashlock = randomBytes(32);
    const [finalMessage, signature] = await signHTLC(Id, diff_hashlock, timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));
  }

  ///  Can't add lock signature if signed with different timelock.
  const T12_6 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();
    const pda = await getPdaParams(Id);

    await createPHTLC(Id, new anchor.BN(AMOUNT), timelock);

    const diff_time = (new Date().getTime() - 1000000) / 1000;
    const diff_timelock = new anchor.BN(diff_time);
    const [finalMessage, signature] = await signHTLC(Id, hashlock, diff_timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));
  }

  /// Can't add lock signature if signed by other user.
  const T12_7 = async () => {
    const Id = randomBytes(32);
    const time = (new Date().getTime() + 1000000) / 1000;
    const timelock = new anchor.BN(time);
    const secret = randomBytes(32);
    const hashlock = createHash("sha256").update(secret).digest();

    let bobTokenAccount
    [bob, bobTokenAccount] = await createUserAndAssociatedWallet();
    bobTokenAccount = await mintTokensForUser(bob.publicKey, tokenMint);
    // Create a token account for Bob.
    const pda = await getPdaParams(Id);

    const commitTx = await program.methods
      .commit(Array.from(Id), HOPCHAINS, HOPASSETS, HOPADDRESSES, DSTCHAIN, DSTASSET, DSTADDRESS, SRCASSET, bob.publicKey, timelock, new anchor.BN(AMOUNT), pda.htlcBump)
      .accountsPartial({
        sender: bob.publicKey,
        htlc: pda.htlc,
        htlcTokenAccount: pda.htlcTokenAccount,
        tokenContract: tokenMint,
        senderTokenAccount: bobTokenAccount
      })
      .signers([bob])
      .rpc();

    //Is signed by wallet while the sender is bob.
    const [finalMessage, signature] = await signHTLC(Id, hashlock, timelock)

    let tx = new anchor.web3.Transaction()
      .add(
        // Ed25519 instruction 
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: wallet.publicKey.toBytes(),
          message: finalMessage,
          signature: signature,
        })
      )
      .add(
        // Our instruction
        await program.methods.
          addLockSig(Array.from(Id), Array.from(hashlock), timelock, Array.from(signature)).
          accountsPartial({
            payer: wallet.publicKey,
            htlc: pda.htlc,
            ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .signers([wallet.payer])
          .instruction()
      );

    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet.payer);

    await provider.connection.sendRawTransaction(tx.serialize()).catch(e => console.error(e));

  }

  /// Tests for add Lock Signature function.
  it("T12", async () => {

    await T12_1()
    await T12_2()
    await T12_3()
    await T12_4()
    await T12_5()
    await T12_6()
    await T12_7()
  });

});