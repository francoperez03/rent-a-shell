// Per-session escrow for Rent a Shell.
// The renter deposits USDC into the escrow vault (people, Solana Pay) or the operator opens the escrow first and
// the x402 facilitator pays into its vault (agents, spec 14). When the session ends well, the operator (the Forger
// gateway's keypair) settles: fee_bps to the treasury and the rest to the Forger. If the shell drops, the
// operator refunds the payer. If the gateway disappears, anyone can return everything to the payer one
// hour after expires_at. No path sends funds anywhere other than forger, treasury or payer.
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("5459LTpropgaL1a7Ct4nRUN6BULGvJs3STMcreh2gf4X");

pub const RECLAIM_GRACE_SECS: i64 = 3600;
pub const MAX_FEE_BPS: u16 = 10_000;
/// Only this key can initialize the config (spec 10): the devnet upgrade authority. Changes only with an upgrade.
pub const ADMIN: Pubkey = pubkey!("GUBSsjpKTLwUMBnAncG4AK34xFNwaNuEu1PCYW4PN3JP");

#[program]
pub mod shell_escrow {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, treasury: Pubkey, fee_bps: u16, usdc_mint: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, EscrowError::FeeTooHigh);
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.treasury = treasury;
        c.fee_bps = fee_bps;
        c.usdc_mint = usdc_mint;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, treasury: Pubkey, fee_bps: u16, usdc_mint: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, EscrowError::FeeTooHigh);
        let c = &mut ctx.accounts.config;
        c.treasury = treasury;
        c.fee_bps = fee_bps;
        c.usdc_mint = usdc_mint;
        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        session_id: [u8; 32],
        amount: u64,
        forger: Pubkey,
        operator: Pubkey,
        expires_at: i64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        let e = &mut ctx.accounts.escrow;
        e.session_id = session_id;
        e.payer = ctx.accounts.payer.key();
        e.forger = forger;
        e.operator = operator;
        e.mint = ctx.accounts.mint.key();
        e.amount = amount;
        e.expires_at = expires_at;
        e.state = EscrowState::Funded;
        e.rent_to = ctx.accounts.payer.key();
        e.bump = ctx.bumps.escrow;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payer_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )
    }

    /// Agent path (spec 14): the operator opens the escrow and its vault before the x402 402, so the facilitator's
    /// plain TransferChecked lands in the vault. The payer is unknown until the payment settles.
    pub fn open(ctx: Context<Open>, session_id: [u8; 32], amount: u64, forger: Pubkey, expires_at: i64) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        let e = &mut ctx.accounts.escrow;
        e.session_id = session_id;
        e.payer = Pubkey::default();
        e.forger = forger;
        e.operator = ctx.accounts.operator.key();
        e.mint = ctx.accounts.mint.key();
        e.amount = amount;
        e.expires_at = expires_at;
        e.state = EscrowState::Opened;
        e.rent_to = ctx.accounts.operator.key();
        e.bump = ctx.bumps.escrow;
        Ok(())
    }

    /// Once, after the facilitator paid: records who paid (for refunds) and moves the escrow to Funded.
    /// ponytail: requires the vault to hold the amount, so Funded always means funded; the gateway retries otherwise.
    pub fn set_payer(ctx: Context<SetPayer>, payer: Pubkey) -> Result<()> {
        let e = &mut ctx.accounts.escrow;
        require!(e.state == EscrowState::Opened, EscrowError::InvalidState);
        require!(e.payer == Pubkey::default(), EscrowError::PayerAlreadySet);
        require!(payer != Pubkey::default(), EscrowError::NoPayer);
        require!(ctx.accounts.vault.amount >= e.amount, EscrowError::NotFunded);
        e.payer = payer;
        e.state = EscrowState::Funded;
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let a = ctx.accounts;
        // the vault balance, not the stored amount: the facilitator may have paid in a little more
        let amount = a.vault.amount;
        let fee = (amount as u128 * a.config.fee_bps as u128 / MAX_FEE_BPS as u128) as u64;
        let seeds: &[&[u8]] = &[b"escrow", &a.escrow.session_id, &[a.escrow.bump]];
        let t = Payout { token_program: &a.token_program, mint: &a.mint, vault: &a.vault, escrow: &a.escrow };
        t.send(&a.forger_token, amount - fee, seeds)?;
        if fee > 0 {
            t.send(&a.treasury_token, fee, seeds)?;
        }
        t.close(&a.rent_to, seeds)?;
        a.escrow.state = EscrowState::Settled;
        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let a = ctx.accounts;
        let seeds: &[&[u8]] = &[b"escrow", &a.escrow.session_id, &[a.escrow.bump]];
        let t = Payout { token_program: &a.token_program, mint: &a.mint, vault: &a.vault, escrow: &a.escrow };
        t.send(&a.payer_token, a.vault.amount, seeds)?;
        t.close(&a.rent_to, seeds)?;
        a.escrow.state = EscrowState::Refunded;
        Ok(())
    }

    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        let a = ctx.accounts;
        let now = Clock::get()?.unix_timestamp;
        require!(now > a.escrow.expires_at.saturating_add(RECLAIM_GRACE_SECS), EscrowError::NotReclaimableYet);
        let seeds: &[&[u8]] = &[b"escrow", &a.escrow.session_id, &[a.escrow.bump]];
        let t = Payout { token_program: &a.token_program, mint: &a.mint, vault: &a.vault, escrow: &a.escrow };
        t.send(&a.payer_token, a.vault.amount, seeds)?;
        t.close(&a.rent_to, seeds)?;
        a.escrow.state = EscrowState::Refunded;
        Ok(())
    }
}

/// Transfers out of the vault, signed by the escrow PDA.
struct Payout<'a, 'info> {
    token_program: &'a Interface<'info, TokenInterface>,
    mint: &'a InterfaceAccount<'info, Mint>,
    vault: &'a InterfaceAccount<'info, TokenAccount>,
    escrow: &'a Account<'info, Escrow>,
}

impl<'a, 'info> Payout<'a, 'info> {
    fn send(&self, to: &InterfaceAccount<'info, TokenAccount>, amount: u64, seeds: &[&[u8]]) -> Result<()> {
        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.vault.to_account_info(),
                    mint: self.mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            self.mint.decimals,
        )
    }

    /// The empty vault is closed and its rent goes back to whoever created it (payer on deposit, operator on open).
    /// ponytail: the Escrow account stays open with its final state (audit trail and blocks session_id reuse).
    fn close(&self, rent_to: &AccountInfo<'info>, seeds: &[&[u8]]) -> Result<()> {
        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.vault.to_account_info(),
                destination: rent_to.clone(),
                authority: self.escrow.to_account_info(),
            },
            &[seeds],
        ))
    }
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowState {
    Funded,
    Settled,
    Refunded,
    /// Opened by the operator for an x402 payment; no payer yet (spec 14).
    Opened,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub session_id: [u8; 32],
    pub payer: Pubkey,
    pub forger: Pubkey,
    pub operator: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub state: EscrowState,
    /// Receives the vault rent on close: the payer (deposit) or the operator (open).
    pub rent_to: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut, constraint = admin.key() == ADMIN @ EscrowError::WrongAdmin)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Box<Account<'info, Config>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ EscrowError::WrongAdmin)]
    pub config: Box<Account<'info, Config>>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct Deposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, constraint = config.usdc_mint == mint.key() @ EscrowError::WrongMint)]
    pub config: Box<Account<'info, Config>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = payer, token::token_program = token_program)]
    pub payer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init, payer = payer, space = 8 + Escrow::INIT_SPACE, seeds = [b"escrow", session_id.as_ref()], bump)]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct Open<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, constraint = config.usdc_mint == mint.key() @ EscrowError::WrongMint)]
    pub config: Box<Account<'info, Config>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init, payer = operator, space = 8 + Escrow::INIT_SPACE, seeds = [b"escrow", session_id.as_ref()], bump)]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        init,
        payer = operator,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPayer<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.session_id.as_ref()],
        bump = escrow.bump,
        has_one = operator @ EscrowError::WrongOperator,
        has_one = mint @ EscrowError::WrongMint
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = treasury @ EscrowError::WrongTreasury)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.session_id.as_ref()],
        bump = escrow.bump,
        has_one = operator @ EscrowError::WrongOperator,
        has_one = forger,
        has_one = rent_to,
        has_one = mint @ EscrowError::WrongMint,
        constraint = escrow.state == EscrowState::Funded @ EscrowError::InvalidState
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: validated by has_one on escrow; only receives tokens.
    pub forger: UncheckedAccount<'info>,
    /// CHECK: validated by has_one on config; only receives tokens.
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: validated by has_one on escrow; receives the vault rent.
    #[account(mut)]
    pub rent_to: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = mint,
        associated_token::authority = forger,
        associated_token::token_program = token_program
    )]
    pub forger_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program
    )]
    pub treasury_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.session_id.as_ref()],
        bump = escrow.bump,
        has_one = operator @ EscrowError::WrongOperator,
        has_one = payer,
        has_one = rent_to,
        has_one = mint @ EscrowError::WrongMint,
        constraint = escrow.state == EscrowState::Funded @ EscrowError::InvalidState,
        constraint = escrow.payer != Pubkey::default() @ EscrowError::NoPayer
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: validated by has_one on escrow; owner of the token account that gets the refund.
    pub payer: UncheckedAccount<'info>,
    /// CHECK: validated by has_one on escrow; receives the vault rent.
    #[account(mut)]
    pub rent_to: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = mint,
        associated_token::authority = payer,
        associated_token::token_program = token_program
    )]
    pub payer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    /// Anyone can trigger the reclaim; they only pay for the payer ATA if it is needed.
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.session_id.as_ref()],
        bump = escrow.bump,
        has_one = payer,
        has_one = rent_to,
        has_one = mint @ EscrowError::WrongMint,
        constraint = escrow.state == EscrowState::Funded @ EscrowError::InvalidState,
        constraint = escrow.payer != Pubkey::default() @ EscrowError::NoPayer
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: validated by has_one on escrow; owner of the token account that gets the refund.
    pub payer: UncheckedAccount<'info>,
    /// CHECK: validated by has_one on escrow; receives the vault rent.
    #[account(mut)]
    pub rent_to: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = payer,
        associated_token::token_program = token_program
    )]
    pub payer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Operator does not match the escrow")]
    WrongOperator,
    #[msg("Escrow is not in the Funded state")]
    InvalidState,
    #[msg("Mint is not the configured USDC")]
    WrongMint,
    #[msg("expires_at + 1 h has not passed yet")]
    NotReclaimableYet,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("fee_bps cannot exceed 10000")]
    FeeTooHigh,
    #[msg("Treasury is not the configured one")]
    WrongTreasury,
    #[msg("Only the admin can change the config")]
    WrongAdmin,
    #[msg("Payer already set")]
    PayerAlreadySet,
    #[msg("Escrow has no payer yet")]
    NoPayer,
    #[msg("Vault does not hold the escrow amount")]
    NotFunded,
}
