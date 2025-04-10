import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import TrainContractJson from "../contracts/train/target/train-Train.json" with { type: "json" };
import TokenContractJson from "../contracts/token/target/token-Token.json" with { type: "json" };
import { updateData, readData ,generateId ,publicLogs} from './utils.mjs';

const TrainContractArtifact = loadContractArtifact(TrainContractJson);
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  console.log(`Connecting to PXE at ${PXE_URL}...`);
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [senderWallet] = await getInitialTestAccountsWallets(pxe);
  const sender = senderWallet.getAddress();
  console.log(`Using wallet: ${sender}`);

  const data = readData();
  const Id = generateId();
  const src_receiver = data.src_receiver;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timelock = now + 1000n;
  const token = data.token;
  const amount = 3n;
  const dst_chain = 'TON'.padEnd(8, ' ');
  const dst_asset = 'Toncoin'.padEnd(8, ' ');
  const dst_address = 'TONAddress'.padEnd(48, ' ');
  const randomness = generateId();

  // Authwit
  const TokenContractArtifact = loadContractArtifact(TokenContractJson);
  const asset = await Contract.at(token, TokenContractArtifact, senderWallet);
  
  const transfer = asset
    .withWallet(senderWallet.getAddress())
    .methods.transfer_in_private(
      senderWallet.getAddress(),
      AztecAddress.fromString(data.train),
      amount,
      randomness
    );
  // console.log("transfer: ", transfer);

  const witness = await senderWallet.createAuthWit({
    caller: AztecAddress.fromString(data.train),
    action: transfer,
  });
  // console.log("witness: ", witness);
  console.log("private balance of sender: ",await asset.methods.balance_of_private(senderWallet.getAddress()).simulate())
  const contract = await Contract.at(
    AztecAddress.fromString(data.train),
    TrainContractArtifact,
    senderWallet
  );
  const commitTx = await contract.methods.commit_private_user(
    Id,
    AztecAddress.fromString(src_receiver),
    timelock,
    AztecAddress.fromString(token),
    amount,
    dst_chain,
    dst_asset,
    dst_address,
    randomness
  ).send({ authWitnesses: [witness] }).wait();

  console.log("tx : ", commitTx);
  console.log("private balance of sender: ",await asset.methods.balance_of_private(senderWallet.getAddress()).simulate())
  publicLogs(pxe);
  updateData({commitId: Id.toString()});
}

main().catch((err) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
