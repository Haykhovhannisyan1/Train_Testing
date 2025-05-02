import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract } from '@aztec/aztec.js';
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
  connectPXE,
} from './utils.ts';
import { CheatCodes } from '@aztec/aztec.js/testing';

const TrainContractArtifact = TrainContract.artifact;
const ethRpcUrl = 'http://localhost:8545';

async function main(): Promise<void> {
  const pxe = await connectPXE(8080);
  const cc = await CheatCodes.create([ethRpcUrl], pxe);

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
  // const now = BigInt(Math.floor(Date.now() / 1000));
  const now = await cc.eth.timestamp();
  const timelock = now + 901;

  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    senderWallet,
  );
  const is_contract_initialized = await contract.methods
    .is_contract_initialized(Id)
    .simulate();
  if (!is_contract_initialized) throw new Error('HTLC Does Not Exsist');
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
  console.log(
    'Public balance of Train: ',
    await asset.methods.balance_of_public(data.train).simulate(),
  );
  const assetMinter = await TokenContract.at(data.token, wallet2);
  await simulateBlockPassing(pxe, assetMinter, wallet3, 3);
  getHTLCDetails(contract, Id);
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
