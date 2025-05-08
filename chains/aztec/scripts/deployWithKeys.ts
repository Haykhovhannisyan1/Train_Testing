import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import {
  deriveKeys,
  Fr,
  DeployOptions,
  ContractInstanceWithAddress,
  ContractArtifact,
  SponsoredFeePaymentMethod,
} from '@aztec/aztec.js';
import { TrainContract } from './Train.ts';
import { getPXEs, logPXERegistrations, readData, updateData } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';

async function main(): Promise<void> {
  const [pxe1, pxe2, pxe3] = await getPXEs(['pxe1', 'pxe2', 'pxe3']);

  const sponseredFPC = await getSponsoredFPCInstance();
  const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);

  const data = readData();
  let secretKey = Fr.fromString(data.deployerSecertKey);
  let salt = Fr.fromString(data.deployerSalt);
  let schnorrAccount = await getSchnorrAccount(
    pxe3,
    secretKey,
    deriveSigningKey(secretKey),
    salt,
  );
  let deployerWallet = await schnorrAccount.getWallet();

  // Train protocol deployment on PXE3
  const trainSecretKey = Fr.random();
  const { publicKeys: trainPublicKeys } = await deriveKeys(trainSecretKey);
  const deploymentOptions: DeployOptions = {
    contractAddressSalt: Fr.random(),
    universalDeploy: false,
    skipClassRegistration: false,
    skipPublicDeployment: false,
    skipInitialization: false,
    fee: { paymentMethod },
  };
  const trainContract = await TrainContract.deployWithPublicKeys(
    trainPublicKeys,
    deployerWallet,
  )
    .send(deploymentOptions)
    .deployed();
  const trainPartialAddress = await trainContract.partialAddress;

  //register contract in all PXEs
  await pxe1.registerContract({
    instance: trainContract.instance as ContractInstanceWithAddress,
    artifact: TrainContract.artifact as ContractArtifact,
  });

  await pxe2.registerContract({
    instance: trainContract.instance as ContractInstanceWithAddress,
    artifact: TrainContract.artifact as ContractArtifact,
  });

  await pxe3.registerContract({
    instance: trainContract.instance as ContractInstanceWithAddress,
    artifact: TrainContract.artifact as ContractArtifact,
  });

  updateData({
    trainSecretKey: trainSecretKey,
    trainPublicKeys: trainPublicKeys,
    trainPartialAddress: trainPartialAddress,
    trainContractAddress: trainContract.address,
    trainInitHash: trainContract.instance.initializationHash,
  });

  await logPXERegistrations([pxe1, pxe2, pxe3]);
}

main().catch((err) => {
  console.error(`❌ Error: ${err}`);
  process.exit(1);
});
