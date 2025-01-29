require('dotenv').config();
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { mnemonicToWalletKey } from "ton-crypto";
import { TonClient, WalletContractV5R1, Address } from "@ton/ton";
import { Train,Lock, } from "../build/train/tact_Train"; 
import { toNano, sleep } from "../utils/utils";

export async function run() {
  const endpoint = await getHttpEndpoint({ network: "testnet" });
  const client = new TonClient({ endpoint });
  const mnemonic = process.env.MNEMONIC!; 

  const key = await mnemonicToWalletKey(mnemonic.split(" "));
  const wallet = WalletContractV5R1.create({ publicKey: key.publicKey, workchain: 0 });
  if (!await client.isContractDeployed(wallet.address)) {
    return console.log("Wallet is not deployed");
  }

  const walletContract = client.open(wallet);
  const walletSender = walletContract.sender(key.secretKey);
  const seqno = await walletContract.getSeqno();

  const contractAddress = Address.parse(process.env.CONTRACT!); 
  const newContract = Train.fromAddress(contractAddress);
  const contractProvider = client.open(newContract);

  const hashlock = BigInt(process.env.hashlock!); 
  const timelock = BigInt(Math.floor(Date.now() / 1000) + 920); 
  const srcReceiver = Address.parse("0QCfCUwHtdIzOvupHmIQO-z40lrb2sUsYWRrPgPhCiiw64m1"); 
  const srcAsset = "TON"; 
  const dstChain = "STARKNET_SEPOLIA"; 
  const dstAddress = "0x0430a74277723D1EBba7119339F0F8276ca946c1B2c73DE7636Fd9EBA31e1c1f"; 
  const dstAsset = "ETH"; 
  const Id = BigInt(process.env.id2!); 
  const amount = toNano('0.5');
  const rewardAmount = toNano('0.1');
  const rewardTimelock = BigInt(Math.floor(Date.now() / 1000) + 100);

  const lockMessage: Lock = {
    $$type: "Lock",
    Id: Id,
    hashlock: hashlock,
    timelock: timelock,
    srcReceiver: srcReceiver,
    srcAsset: srcAsset,
    dstChain: dstChain,
    dstAddress: dstAddress,
    dstAsset: dstAsset,
    amount: amount,
    reward: rewardAmount,
    rewardTimelock: rewardTimelock
  };

  console.log("Sending Lock message...");
  await contractProvider.send(walletSender, { value: toNano("1"), bounce: true }, lockMessage);

  let currentSeqno = seqno;
  while (currentSeqno == seqno) {
    console.log("Waiting for transaction to confirm...");
    await sleep(1500);
    currentSeqno = await walletContract.getSeqno();
  }
  console.log("Transaction confirmed!");
}

run().catch(console.error);
