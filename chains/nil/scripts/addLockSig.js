const fs = require("fs");
const path = require("path");
const niljs = require("@nilfoundation/niljs"); 
const ethers = require("ethers");
const viem = require("viem");
const createWallet = require("../scripts/createWallet.js");
require('dotenv').config();

const artifactPath = path.resolve(__dirname, "../artifacts/contracts/Train.sol/Train.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const CONTRACT_ABI = artifact.abi;

(async () => {
  const client = new niljs.PublicClient({
  transport: new niljs.HttpTransport({
    endpoint: process.env.RPC_ENDPOINT,
    timeout: 50000,
  }),
  shardId: 1,
});

    const privKey = "";
    const instance  = await createWallet.createWallet();
    const wallet = instance.wallet;
    const chainId = await client.chainId();
    const gasPrice = await client.getGasPrice(1);

    const id = "0x24A7A0A3630D6B6E4DF04CF38322FF3F0F511FE8C64552CD4DBE4C79D34F6BE2";
    const hashlock = "0xddfafe7925d46e633decb4cb3c933b4c2f7d56679487f4b88ea3e6422eb2b81c";
    const timelock = (await client.getBlockByNumber("latest")).number + 10;
    const htlcAddress = "0x00019b0a7f7bd293a0d8dc3f2526168247c50edb";

    const encoded = viem.encodePacked(['bytes32', 'bytes32', 'uint256'], [id, hashlock, timelock]);
    const msgHash = viem.keccak256(encoded);

    const signer = new niljs.LocalECDSAKeySigner({
      privateKey: privKey,
    });

    const signature = await signer.sign(msgHash.slice(2));

  try {
    const payload = {
        to: htlcAddress,
        refundTo: wallet.address,
        bounceTo: wallet.address,
        abi: CONTRACT_ABI,
        functionName: "addLockSig",
        args: [
            id,
            hashlock,
            timelock,
            niljs.bytesToHex(signature)
        ],
        deploy: false,
        feeCredit: gasPrice * 1_000_000n,
        chainId: chainId,
    };
    const hash = await wallet.sendMessage(payload);

    console.log("addLockSig transaction hash:", hash);
    
    const receipt = await niljs.waitTillCompleted(client, hash);
    console.log(receipt)
  } catch (error) {
    console.error("Error in sendMessage:", error);
  }
})();


