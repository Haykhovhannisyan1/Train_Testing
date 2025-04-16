import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AztecAddress,
  Contract,
  createPXEClient,
  loadContractArtifact,
  waitForPXE,
} from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import {
  stringToUint8Array,
  readData,
  publicLogs,
  generateSecretAndHashlock,
  updateData,
  simulateBlockPassing,
  getHTLCDetails,
} from './utils.ts';

const TrainContractArtifact = TrainContract.artifact;
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main(): Promise<void> {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [senderWallet, wallet2, wallet3]: any[] =
    await getInitialTestAccountsWallets(pxe);
  const sender: string = senderWallet.getAddress();
  console.log(`Using wallet: ${sender}`);

  const pair = generateSecretAndHashlock();
  updateData({
    hashlock0: pair[1].toString(),
    secret0: pair[0].toString(),
  });

  const data = readData();
  const Id = BigInt(data.commitId);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timelock = now + 1500n;

  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    senderWallet,
  );
  const addLockTx = await contract.methods
    .add_lock_private_user(Id, stringToUint8Array(data.hashlock0), timelock)
    .send()
    .wait();

  console.log('tx : ', addLockTx);
  publicLogs(pxe);

  const TokenContractArtifact = TokenContract.artifact;
  const asset = await Contract.at(
    AztecAddress.fromString(data.token),
    TokenContractArtifact,
    senderWallet,
  );
  const assetMinter = await TokenContract.at(data.token, wallet2);
  await simulateBlockPassing(pxe, assetMinter, wallet3, 3);
  getHTLCDetails(contract, Id);
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
