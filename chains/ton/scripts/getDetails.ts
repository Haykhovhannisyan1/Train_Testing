require('dotenv').config();
import { getHttpEndpoint } from '@orbs-network/ton-access';
import { TonClient,  } from 'ton';
import { Address } from '../node_modules/ton/dist/address/Address';
import {TupleItem} from '../node_modules/ton-core/src/tuple/tuple'
async function run() {
    const endpoint = await getHttpEndpoint({
        network: 'testnet',
    });

    const client = new TonClient({ endpoint });

    const bigIntValue = 102n;

    const stack: TupleItem[] = [
        {
            type: 'int',
            value: bigIntValue,
        },
    ];

    try {
        const details = await client.callGetMethod(Address.parse(process.env.CONTRACT!), 'getDetails', stack);
console.log("Carlo: ",details)
        const reader = details.stack;

        const commitDetails = [];

        // commitDetails.push(reader.readString()); // dstAddress
        // commitDetails.push(reader.readString()); // dstChain
        // commitDetails.push(reader.readString()); // dstAsset
        // commitDetails.push(reader.readString()); // srcAsset
        // commitDetails.push(reader.readString()); // sender
        // commitDetails.push(reader.readNumber()); // sender public key
        // commitDetails.push(reader.readString()); // srcReceiver
        // commitDetails.push(reader.readNumber()); // timelock
        // commitDetails.push(reader.readNumber()); // amount
        // commitDetails.push(reader.readString()); // messenger
        // commitDetails.push(reader.readNumber()); // locked
        // commitDetails.push(reader.readNumber()); // uncommitted

        // // Log the commit details
        // console.log("Commit Details:");
        // console.log("dstAddress: ", commitDetails[0].bytes);
        // console.log("dstChain: ", commitDetails[1].bytes);
        // console.log("dstAsset: ", commitDetails[2].bytes);
        // console.log("srcAsset: ", commitDetails[3].bytes);
        // console.log("sender: ", commitDetails[4].bytes);
        // console.log("sender public key: ", commitDetails[5]);
        // console.log("srcReceiver: ", commitDetails[6].bytes);
        // console.log("timelock: ", commitDetails[7]);
        // console.log("amount: ", commitDetails[8]);
        // console.log("messenger: ", commitDetails[9].bytes);
        // console.log("locked: ", commitDetails[10]);
        // console.log("uncommitted: ", commitDetails[11]);
    } catch (error) {
        console.error('Failed to get details:', error);
    }
}

run().catch(console.error);
