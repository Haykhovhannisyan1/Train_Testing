import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { createPXEClient, waitForPXE, deriveKeys, Fr } from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { updateData } from './utils.ts';

const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main(): Promise<void> {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [deployerWallet, src_receiver] =
    await getInitialTestAccountsWallets(pxe);
  const deployer = deployerWallet.getAddress();
  console.log(`Using wallet: ${deployer}`);

  console.log('Deploying TRAIN Protocol contract...');
  const trainSecretKey = Fr.random();
  const { publicKeys: trainPublicKeys } = await deriveKeys(trainSecretKey);
  const trainDeployment = TrainContract.deployWithPublicKeys(
    trainPublicKeys,
    deployerWallet,
  );
  const trainContract = await trainDeployment.send().deployed();
  console.log(`TRAIN Protcol contract deployed at ${trainContract.address}`);
  updateData({
    trainSecretKey: trainSecretKey,
    trainPublicKeys: trainPublicKeys,
    train: trainContract.address,
    deployer: deployer.toString(),
    src_receiver: src_receiver.getAddress().toString(),
  });
}

main().catch((err: Error) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
