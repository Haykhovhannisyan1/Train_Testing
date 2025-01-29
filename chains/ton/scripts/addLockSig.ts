require('dotenv').config();
import { beginCell, Cell } from "@ton/ton"; 
import { TonClient, WalletContractV4, Address } from "@ton/ton"; 
import { AddLockSig, Train } from "../build/train/tact_Train"; 
import { getHttpEndpoint } from "@orbs-network/ton-access"; 
import { sleep, toNano } from "../utils/utils"; 
import { mnemonicToWalletKey, sign, signVerify } from 'ton-crypto';

async function run() {
  const endpoint = await getHttpEndpoint({ network: "testnet" });
  const client = new TonClient({ endpoint });

  const mnemonic = process.env.MNEMONIC!; 
  const key = await mnemonicToWalletKey(mnemonic.split(" "));

  const mnemo2 = process.env.MNEMONIC2!;
  const key2 = await mnemonicToWalletKey(mnemo2.split(" "));
  const wallet = WalletContractV4.create({ publicKey: key2.publicKey, workchain: 0 });
  if (!await client.isContractDeployed(wallet.address)) {
    return console.log("Wallet is not deployed");
  }

  const walletContract = client.open(wallet);
  const walletSender = walletContract.sender(key2.secretKey);
  const seqno = await walletContract.getSeqno();

  const contractAddress = Address.parse(process.env.CONTRACT!); 
  const newContract = Train.fromAddress(contractAddress);
  const contractProvider = client.open(newContract);
  const amount = toNano("0.1");

  const Id = BigInt(process.env.id!);
  const hashlock = BigInt(process.env.hashlock!);
  const timelock = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const dataCell: Cell = beginCell()
  .storeInt(Id,257)
  .storeInt(hashlock, 257)
  .storeInt(timelock, 257)
      .endCell();

  const dataSlice = dataCell.beginParse(); 

  const signatureBuffer = sign(dataCell.hash(), key.secretKey);
  const signatureCell = beginCell().storeBuffer(signatureBuffer).endCell();
  const signatureSlice = signatureCell.beginParse();
  console.log('pub key of signer: ', BigInt('0x' + key.publicKey.toString('hex')).toString());
  console.log("signiture verified off chain: ",signVerify(dataCell.hash(),signatureBuffer,key.publicKey));
  
  const lockCommitmentSigMessage: AddLockSig = {
      $$type: "AddLockSig",
      data: dataSlice, 
      signature: signatureSlice,
  };

  console.log("Sending AddLockSig message...");
  await contractProvider.send(walletSender, { value: amount, bounce: true }, lockCommitmentSigMessage);

  let currentSeqno = seqno;
  while (currentSeqno == seqno) {
    console.log("Waiting for transaction to confirm...");
    await sleep(1500);
    currentSeqno = await walletContract.getSeqno();
  }
  console.log("Transaction confirmed!");
}
run().catch(console.error);


