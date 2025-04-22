import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract } from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import {
  readData,
  publicLogs,
  simulateBlockPassing,
  getHTLCDetails,
  connectPXE,
  generateId,
} from './utils.ts';

const TrainContractArtifact = TrainContract.artifact;
const TokenContractArtifact = TokenContract.artifact;

async function main(): Promise<void> {
  const pxe = await connectPXE(8080);

  const [wallet1, wallet2, wallet3]: any[] =
    await getInitialTestAccountsWallets(pxe);
  const sender: string = wallet1.getAddress();
  console.log(`Using wallet: ${sender}`);

  const data = readData();
  const Id = BigInt(data.commitId);

  const asset = await Contract.at(
    AztecAddress.fromString(data.token),
    TokenContractArtifact,
    wallet1,
  );

  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    wallet1,
  );

  console.log(
    'private balance of sender: ',
    await asset.methods.balance_of_private(wallet1.getAddress()).simulate(),
  );
  console.log(
    'contract private: ',
    await asset.methods
      .balance_of_private(AztecAddress.fromString(data.train))
      .simulate(),
  );
  const is_contract_initialized = await contract.methods
    .is_contract_initialized(Id)
    .simulate();
  if (!is_contract_initialized) throw new Error('HTLC Does Not Exsist');
  const refundTx = await contract.methods
    .refund_private(Id, generateId())
    .send()
    .wait();

  console.log('tx : ', refundTx);
  await publicLogs(pxe);

  console.log(
    'private balance of sender: ',
    await asset.methods.balance_of_private(wallet1.getAddress()).simulate(),
  );
  console.log(
    'contract private: ',
    await asset.methods
      .balance_of_private(AztecAddress.fromString(data.train))
      .simulate(),
  );
  const assetMinter = await TokenContract.at(data.token, wallet2);
  await simulateBlockPassing(pxe, assetMinter, wallet3, 3);
  getHTLCDetails(contract, Id);
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
