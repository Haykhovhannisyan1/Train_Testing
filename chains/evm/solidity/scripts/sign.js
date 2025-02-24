const ethers = require("ethers");
require("dotenv").config();

async function signHTLC() {
    const domain = {
      name: 'Train',
      version: '1',
      chainId: 300,
      verifyingContract: '0x1534451B776C3C8D09313d41F9a7b7Caa87e7934',
    };

    const domainSeparator = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
            [
                ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
                ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
                ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
                domain.chainId,
                domain.verifyingContract
            ]
        )
    );

    console.log('Computed Domain Separator:', domainSeparator);

    const types = {
        addLockMsg: [
            { name: "Id", type: "bytes32" },
            { name: "hashlock", type: "bytes32" },
            { name: "timelock", type: "uint48" },
        ],
    };

    const message = {
      Id: '0x4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      hashlock: '0xddfafe7925d46e633decb4cb3c933b4c2f7d56679487f4b88ea3e6422eb2b81c',
      timelock: 1740143201,
    };

    const privateKey =  process.env.PRIV_KEY;
    const wallet = new ethers.Wallet(privateKey);

    const signature = await wallet.signTypedData(domain, types, message);

    console.log("Signature:", signature);    

    const sig = ethers.Signature.from(signature);
    console.log({
        r: sig.r,
        s: sig.s,
        v: sig.v
    });
}

signHTLC().catch(console.error);