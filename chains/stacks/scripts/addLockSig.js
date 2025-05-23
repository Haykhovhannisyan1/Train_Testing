import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  uintCV,
  PostConditionMode,
  bufferCV,
  Cl,
  createStacksPrivateKey,
  getAddressFromPrivateKey,
  signMessageHashRsv,
  TransactionVersion,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { concatBytes, hexToBytes } from "@stacks/common";
import { createHash } from "crypto";

const network = new StacksTestnet();
const secretKey = ""; // Xverse

async function main() {
  const id_ = "41305506774033082";
  const hashlock_ = "88470a9f59f469bf204c9ea2bfc95ff9d7d54adf37cd56fc011e05f857f01c8d";
  const timelock_ = BigInt(Math.floor(Date.now() / 1000) + 3600) ;

  const id = BigInt(id_);
  const hashlock = Buffer.from(hashlock_,"hex");
  const timelock = timelock_;
  
  const txOptions = {
    contractAddress: 'ST2R1JC4FWF70GM9M7C7F4WH76PVZCSNHHP1EBKGM',
    contractName: 'redeemTest',
    functionName: 'add-lock-sig',
    functionArgs: [
      uintCV(id),
      bufferCV(hashlock),
      uintCV(timelock),
      bufferCV(Buffer.from(sign(id_,hashlock_,timelock_),"hex"))
    ],
    senderKey: secretKey,
    validateWithAbi: true,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, network);
    const txId = broadcastResponse.txid;
    console.log(`https://explorer.hiro.so/txid/0x${txId}?chain=testnet`);
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);



function sign(id_,hashlock_,timelock_){
  const address = getAddressFromPrivateKey("dff46abadcbe3051f3eaa0857969117b1ab6bc65f3b6e31155d26236013633cf01", TransactionVersion.Testnet);
  console.log(address);

  const id = Cl.uint(id_);
  const hashlock = hashlock_;
  const timelock = Cl.uint(timelock_.toString());

  const idBytes = Cl.serialize(id);
  const hashlockBytes = hexToBytes(hashlock);
  const timelockBytes = Cl.serialize(timelock);

  const message = concatBytes(idBytes, hashlockBytes, timelockBytes);
  const messageHash = createHash("sha256").update(message).digest("hex");

  const signature = signMessageHashRsv({
    messageHash: messageHash,
    privateKey: createStacksPrivateKey("dff46abadcbe3051f3eaa0857969117b1ab6bc65f3b6e31155d26236013633cf01"),
  }).data;

  return signature;
}




