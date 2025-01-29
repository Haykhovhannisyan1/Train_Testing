require('dotenv').config();
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { TonClient } from "ton";
import { Address } from '../node_modules/ton/dist/address/Address';

async function run(){
    const endpoint = await getHttpEndpoint({
        network: "testnet",
    }); 

    const client = new TonClient({ endpoint });

    const stack: any[] | undefined = [];

    const details = await client.callGetMethod(Address.parse(process.env.CONTARCT!), 'getContractsLength', stack);

    const commitDetails = await client.callGetMethod(Address.parse(process.env.CONTARCT!), 'getRewardsLength', stack);

    console.log("HTLC list length : ",details.stack[0][1]);
    console.log("Reward list length : ",commitDetails.stack[0][1]);
}

run().catch(console.error);



