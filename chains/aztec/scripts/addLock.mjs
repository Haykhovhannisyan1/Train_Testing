import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TrainContractJson from "../contracts/train/target/train-Train.json" with { type: "json" };
import { stringToUint8Array,readData ,publicLogs, generateSecretAndHashlock, updateData} from './utils.mjs';

const TrainContractArtifact = loadContractArtifact(TrainContractJson);
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [senderWallet] = await getInitialTestAccountsWallets(pxe);
  const sender = senderWallet.getAddress();
  console.log(`Using wallet: ${sender}`);
  const pair = generateSecretAndHashlock();
  updateData({hashlock0: pair[1].toString(),secret0: pair[0].toString()});

  const data = readData();
  const Id = BigInt(data.commitId);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timelock = now + 1009n;
  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    senderWallet
  );
  const addLockTx = await contract.methods.add_lock_private_user(
    Id,
    stringToUint8Array(data.hashlock0),
    timelock,
  ).send().wait();

  console.log("tx : ", addLockTx);
  publicLogs(pxe);
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
