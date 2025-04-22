import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { DeployOptions, deriveKeys, Fr, Wallet } from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { connectPXE, updateData } from './utils.ts';

async function main(): Promise<void> {
  const pxe = await connectPXE(8080);
  const wallets = await getInitialTestAccountsWallets(pxe);

  const trainSecretKey = Fr.random();
  const { publicKeys: trainPublicKeys } = await deriveKeys(trainSecretKey);
  const trainDeployment = TrainContract.deployWithPublicKeys(
    trainPublicKeys,
    wallets[0] as unknown as Wallet,
  );

  const deploymentOptions: DeployOptions = {
    contractAddressSalt: Fr.random(),
    universalDeploy: false,
    skipClassRegistration: false,
    skipPublicDeployment: false,
    skipInitialization: false,
  };
  const trainContract = await trainDeployment
    .send(deploymentOptions)
    .deployed();
  const trainPartialAddress = await trainContract.partialAddress;
  console.log(`✅ TRAIN Protcol contract deployed at ${trainContract.address}`);
  pxe.registerAccount(trainSecretKey, trainPartialAddress);
  updateData({
    trainSecretKey: trainSecretKey,
    trainPublicKeys: trainPublicKeys,
    trainPartialAddress: trainPartialAddress,
    train: trainContract.address,
    trainInitHash: trainContract.instance.initializationHash,
    wallet0: wallets[0].getAddress(),
    wallet1: wallets[1].getAddress(),
  });
}

main().catch((err: Error) => {
  console.error(`❌ Error: ${err}`);
  process.exit(1);
});
