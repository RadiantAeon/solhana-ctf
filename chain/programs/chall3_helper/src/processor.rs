//! Program instruction processor

use solana_program::{
    account_info::{next_account_info, AccountInfo, self},
    entrypoint::ProgramResult,
    program::{invoke_signed, invoke},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction, instruction::AccountMeta,
};

/// Amount of bytes of account data to allocate
pub const SIZE: usize = 42;

/// Instruction processor
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Create in iterator to safety reference accounts in the slice
    let account_info_iter = &mut accounts.iter();

    // Account info for the program being invoked
    let program_info = next_account_info(account_info_iter)?;

    // Invoke the chall 3 program repay
    invoke(
        &solana_program::instruction::Instruction { program_id: *program_info.key, accounts: 
            account_info_iter.map(|account_info| -> AccountMeta {
                if account_info.is_signer {
                    return AccountMeta::new(*account_info.key, true)
                } else if account_info.is_writable {
                    return AccountMeta::new(*account_info.key, false)
                }
                return AccountMeta::new_readonly(*account_info.key, false)
            }).collect(), data: instruction_data.to_vec()},
        // Order doesn't matter and this slice could include all the accounts and be:
        // `&accounts`
        accounts,
    )?;

    Ok(())
}
