import * as fs from 'fs';
import * as path from 'path';
import { LayerswapV8 } from "../build/HashedTimeLockTON/tact_LayerswapV8";
import { prepareTactDeployment } from "@tact-lang/deployer";

async function deployContract() {
    let testnet = true; 
    let packageName = 'tact_LayerswapV8.pkg';
    let outputPath = path.resolve(__dirname, '../build/HashedTimeLockTON'); 
    let init = await LayerswapV8.init();

    let data = init.data.toBoc(); 
    let pkg = fs.readFileSync(path.resolve(outputPath, packageName)); 

    let link = await prepareTactDeployment({ pkg, data, testnet });

    console.log('Deploy link: ' + link);
}

deployContract().catch(err => {
    console.error('Failed to deploy contract:', err);
});

