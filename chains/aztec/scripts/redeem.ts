import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AccountWalletWithSecretKey,
  AztecAddress,
  Contract,
  ContractInstanceWithAddress,
  Wallet,
} from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import {
  stringToUint8Array,
  readData,
  publicLogs,
  generateId,
  getHTLCDetails,
  simulateBlockPassing,
  connectPXE,
  getAztecNode,
} from './utils.ts';

const TrainContractArtifact = TrainContract.artifact;
const TokenContractArtifact = TokenContract.artifact;

async function main(): Promise<void> {
  const pxe = await connectPXE(8083);
  const data = readData();
  const [wallet1, wallet2, wallet3]: AccountWalletWithSecretKey[] =
    await getInitialTestAccountsWallets(pxe);

  await pxe.registerAccount(
    wallet2.getSecretKey(),
    wallet2.getCompleteAddress().partialAddress,
  );
  await pxe.registerAccount(
    wallet3.getSecretKey(),
    wallet3.getCompleteAddress().partialAddress,
  );

  const node = await getAztecNode(8080);
  const trainInstance = await node.getContract(
    AztecAddress.fromString(data.train),
  );
  const tokenInstance = await node.getContract(
    AztecAddress.fromString(data.token),
  );

  await wallet2.registerContract({
    instance: trainInstance as unknown as ContractInstanceWithAddress,
    artifact: TrainContractArtifact,
  });

  await pxe.registerContract({
    instance: trainInstance as unknown as ContractInstanceWithAddress,
    artifact: TrainContractArtifact,
  });

  await wallet2.registerContract({
    instance: tokenInstance as unknown as ContractInstanceWithAddress,
    artifact: TokenContractArtifact,
  });

  await pxe.registerContract({
    instance: tokenInstance as unknown as ContractInstanceWithAddress,
    artifact: TokenContractArtifact,
  });

  console.log(
    'registered accounts in PXE: ',
    await pxe.getRegisteredAccounts(),
  );
  console.log('registered contracts in PXE: ', await pxe.getContracts());

  const Id = BigInt(data.commitId);
  const randomness = generateId();
  const asset = await TokenContract.at(
    AztecAddress.fromString(data.token),
    wallet2,
  );
  const train = await TrainContract.at(
    AztecAddress.fromString(data.train),
    wallet2,
  );
  console.log(
    'private balance of src_receiver: ',
    await asset.methods.balance_of_private(wallet2.getAddress()).simulate(),
  );
  console.log(
    'contract public: ',
    await asset.methods
      .balance_of_public(train.address)
      .simulate(),
  );
  // // console.log(
  // //   'contract public: ',
  // //   await asset.methods
  // //     .balance_of_public(AztecAddress.fromString(data.train))
  // //     .simulate(),
  // // );
  // const noteFilter = {
  //   contractAddress: AztecAddress.fromString(data.train),
  // };
  // let trainNotes = await pxe.getNotes(noteFilter);
  // console.log('trainNotes: ', trainNotes);
  // // const is_contract_initialized = await train.methods
  // //   .is_contract_initialized(Id)
  // //   .simulate();
  // // if (!is_contract_initialized) throw new Error('HTLC Does Not Exsist');
  const redeemTx = await train.methods
    .redeem_private(
      Id,
      Array.from(stringToUint8Array(data.secret0)),
      randomness,
    )
    .send()
    .wait();

  console.log('tx : ', redeemTx);
  console.log(
    'private balance of src_receiver: ',
    await asset.methods.balance_of_private(wallet2.getAddress()).simulate(),
  );
  console.log(
    'contract public: ',
    await asset.methods
      .balance_of_public(AztecAddress.fromString(data.train))
      .simulate(),
  );
  // console.log(
  //   'contract public: ',
  //   await asset.methods
  //     .balance_of_public(AztecAddress.fromString(data.train))
  //     .simulate(),
  // );
  await publicLogs(pxe);
  await simulateBlockPassing(pxe, asset, wallet3, 3);
  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    wallet2 as unknown as Wallet,
  );
  await getHTLCDetails(contract, Id);
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
