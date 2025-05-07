import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { DeployOptions, Fr, SponsoredFeePaymentMethod } from '@aztec/aztec.js';
import { getPXEs, updateData } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

async function main(): Promise<void> {
  const [pxe1, pxe2] = await getPXEs(['pxe1', 'pxe2']);

  const sponseredFPC = await getSponsoredFPCInstance();

  await pxe1.registerContract({
    instance: sponseredFPC,
    artifact: SponsoredFPCContract.artifact,
  });

  await pxe2.registerContract({
    instance: sponseredFPC,
    artifact: SponsoredFPCContract.artifact,
  });

  const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);

  //   user wallet in PXE 1
  let secretKey = Fr.random();
  let salt = Fr.random();
  let schnorrAccount = await getSchnorrAccount(
    pxe1,
    secretKey,
    deriveSigningKey(secretKey),
    salt,
  );
  let tx = await schnorrAccount.deploy({ fee: { paymentMethod } }).wait();
  let userWallet = await schnorrAccount.getWallet();
  let userAddress = userWallet.getAddress();

  //   solver wallet in PXE 2
  let secretKey2 = Fr.random();
  let salt2 = Fr.random();
  let schnorrAccount2 = await getSchnorrAccount(
    pxe2,
    secretKey2,
    deriveSigningKey(secretKey),
    salt2,
  );

  let tx2 = await schnorrAccount2.deploy({ fee: { paymentMethod } }).wait();
  let solverWallet = await schnorrAccount.getWallet();
  let solverAddress = solverWallet.getAddress();

  updateData({
    userSecertKey: secretKey,
    userSalt: salt,
    userAddress: userAddress,
    solverSecertKey: secretKey2,
    solverSalt: salt2,
    solverAddress: solverAddress,
  });

  console.log(
    'PXE 1 registered accounts: ',
    await pxe1.getRegisteredAccounts(),
  );
  console.log('PXE 1 registered contracts: ', await pxe1.getContracts());
  console.log(
    'PXE 2 registered accounts: ',
    await pxe2.getRegisteredAccounts(),
  );
  console.log('PXE 2 registered contracts: ', await pxe2.getContracts());
}

main().catch((err) => {
  console.error(`❌ Error: ${err}`);
  process.exit(1);
});
