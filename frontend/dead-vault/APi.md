# DeadVault — API Reference

**Base URL**: `http://localhost:8080` (dev) · `https://your-domain.com` (prod)  
**Content-Type**: `application/json` for all request and response bodies  
**Auth**: All endpoints marked 🔒 require `Authorization: Bearer <token>` in the request header. Obtain the token from `POST /api/auth/verify`.

---

## Table of Contents

1. [Authentication](#1-authentication)
   - [GET /api/auth/nonce](#11-get-apiaauthnonce)
   - [POST /api/auth/verify](#12-post-apiauthverify)
2. [Will (Vault Setup)](#2-will-vault-setup)
   - [POST /api/will](#21-post-apiwill)
3. [Check-In](#3-check-in)
   - [POST /api/check-in](#31-post-apicheck-in)
   - [GET /api/check-in/status](#32-get-apicheck-instatus)
4. [Vault](#4-vault)
   - [PUT /api/will](#41-put-apiwill)
   - [GET /api/vault/balance](#42-get-apivaultbalance)
5. [Health](#5-health)
   - [GET /actuator/health](#41-get-actuatorhealth)
5. [Error Responses](#5-error-responses)
6. [End-to-End Flow](#6-end-to-end-flow)
7. [Type Reference](#7-type-reference)

---

## 1. Authentication

DeadVault uses **Sign-In With Ethereum (SIWE)**. No passwords. The user signs a plain-text
message with their wallet (e.g. MetaMask), the backend verifies the signature on-chain style,
and returns a short-lived JWT used for all subsequent requests.

### 1.1 `GET /api/auth/nonce`

**Purpose**: Generates a one-time nonce tied to a wallet address. The nonce expires in **5 minutes** and is single-use. The frontend passes this nonce to the wallet for signing.

**Auth required**: No

#### Query Parameters

| Parameter       | Type     | Required | Description                          |
|-----------------|----------|----------|--------------------------------------|
| `walletAddress` | `string` | ✅        | The user's Ethereum address (`0x...`) |

#### Request

```http
GET /api/auth/nonce?walletAddress=0xABCDEF1234567890ABCDEF1234567890ABCDEF12
```

#### Response `200 OK`

```json
{
  "walletAddress": "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
  "nonce": "a3f1b2c4-9e8d-4f7a-b6c5-d4e3f2a1b0c9"
}
```

| Field           | Type     | Description                                              |
|-----------------|----------|----------------------------------------------------------|
| `walletAddress` | `string` | Echoed back — use to build the message string to sign    |
| `nonce`         | `string` | UUID — include verbatim in the message passed to MetaMask |

#### Frontend usage

```typescript
const { nonce } = await fetch(`/api/auth/nonce?walletAddress=${address}`).then(r => r.json())

// Build the exact message the backend will reconstruct for verification
const message = `Sign in to Dead Man's Switch\nWallet: ${address}\nNonce: ${nonce}`
const signature = await signMessageAsync({ message })
```

---

### 1.2 `POST /api/auth/verify`

**Purpose**: Verifies the wallet signature against the nonce. On success, upserts the user record (creates on first sign-in) and returns a **JWT valid for 24 hours**. Store this token and attach it as a `Bearer` header on all subsequent requests.

**Auth required**: No

#### Request Body

```json
{
  "walletAddress": "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
  "nonce": "a3f1b2c4-9e8d-4f7a-b6c5-d4e3f2a1b0c9",
  "signature": "0x4a3b2c1d...130-char hex string"
}
```

| Field           | Type     | Required | Validation                               |
|-----------------|----------|----------|------------------------------------------|
| `walletAddress` | `string` | ✅        | Must match `^0x[0-9a-fA-F]{40}$`         |
| `nonce`         | `string` | ✅        | Must be the nonce returned by `/nonce`    |
| `signature`     | `string` | ✅        | Ethereum signature — 130–134 hex chars    |

#### Response `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI..."
}
```

| Field   | Type     | Description                                                 |
|---------|----------|-------------------------------------------------------------|
| `token` | `string` | JWT. Expires after 24 hours. Use as `Bearer <token>` header |

#### Error responses

| Status | Condition                                            |
|--------|------------------------------------------------------|
| `400`  | Validation failure — missing/malformed fields        |
| `401`  | Signature verification failed or nonce expired/used  |

#### Frontend usage

```typescript
const { token } = await fetch('/api/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress: address, nonce, signature }),
}).then(r => r.json())

localStorage.setItem('dms_token', token)
```

---

## 2. Will (Vault Setup)

### 2.1 `POST /api/will`

🔒 **Auth required**

**Purpose**: The core registration endpoint. The user submits their inheritance wishes as plain English. The backend:

1. Passes the text to **GPT-4o** (via LangChain4j) which extracts structured beneficiary data
2. Routes to the correct vault type (`EQUAL_SPLIT`, `PERCENTAGE_SPLIT`, `TIME_LOCKED`, or `CONDITIONAL_SURVIVAL`)
3. Deploys the appropriate smart contract on **Base** via the hot wallet
4. Persists the config and initialises the 30-day check-in timer
5. Returns the deployed vault address

This endpoint is called **once per user** after first sign-in. Attempting to call it again for a user who already has a deployed vault will fail at the factory contract level (`vault already exists for this owner`).

#### Request Body

```json
{
  "willText": "Give 70% to my wife Alice (0xAAA...) and 30% to my son Jack (0xBBB...)"
}
```

| Field      | Type     | Required | Validation                         |
|------------|----------|----------|------------------------------------|
| `willText` | `string` | ✅        | 10–2000 characters, plain English  |

#### Natural language examples by vault type

| What the user writes | Vault type deployed |
|---|---|
| `"Split equally between Alice (0x...) and Bob (0x...)"` | `EQUAL_SPLIT` → `DMSVault` |
| `"70% to my wife (0x...) and 30% to my son (0x...)"` | `PERCENTAGE_SPLIT` → `DMSVault` |
| `"Give everything to Alice (0x...) but hold for 6 months"` | `TIME_LOCKED` → `DMSTimeLockVault` |
| `"50% always to my wife (0x...), 50% to my brother (0x...) only if he is still alive"` | `CONDITIONAL_SURVIVAL` → `DMSConditionalVault` |

#### Response `200 OK`

```json
{
  "configId": "d1e2f3a4-b5c6-7890-abcd-ef1234567890",
  "templateType": "PERCENTAGE_SPLIT",
  "beneficiaries": [
    {
      "name": "Alice",
      "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "basisPoints": 7000,
      "condition": "ALWAYS",
      "timeLockDays": 0
    },
    {
      "name": "Jack",
      "walletAddress": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "basisPoints": 3000,
      "condition": "ALWAYS",
      "timeLockDays": 0
    }
  ],
  "contractAddress": "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  "deploymentTxHash": "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"
}
```

| Field               | Type                  | Description                                                                 |
|---------------------|-----------------------|-----------------------------------------------------------------------------|
| `configId`          | `string` (UUID)       | Internal config ID — store for reference                                    |
| `templateType`      | `string`              | `EQUAL_SPLIT` \| `PERCENTAGE_SPLIT` \| `TIME_LOCKED` \| `CONDITIONAL_SURVIVAL` |
| `beneficiaries`     | `Beneficiary[]`       | Resolved beneficiary list — see table below                                 |
| `contractAddress`   | `string`              | Deployed vault address on Base — show to user, link to Basescan             |
| `deploymentTxHash`  | `string`              | Deployment transaction hash — link to `https://sepolia.basescan.org/tx/...` |

#### `Beneficiary` object

| Field           | Type      | Description                                                                    |
|-----------------|-----------|--------------------------------------------------------------------------------|
| `name`          | `string`  | Name extracted from the will text                                              |
| `walletAddress` | `string`  | `0x...` — the on-chain recipient address                                       |
| `basisPoints`   | `number`  | Share out of 10000 (e.g. `7000` = 70%)                                        |
| `condition`     | `string`  | `"ALWAYS"` — unconditional · `"CONDITIONAL_SURVIVAL"` — requires alive proof  |
| `timeLockDays`  | `number`  | `0` unless `templateType` is `TIME_LOCKED`, in which case this is the delay   |

#### Error responses

| Status | Condition                                                                  |
|--------|----------------------------------------------------------------------------|
| `400`  | `willText` blank, too short/long, or LLM could not resolve wallet addresses |
| `401`  | Missing or expired JWT                                                     |
| `500`  | Blockchain deployment failed (RPC error, insufficient gas, etc.)           |

#### Error body `400`

```json
{
  "error": "Will could not be processed: 1 beneficiary wallet address(es) are missing — include 0x addresses in your will text"
}
```

#### Frontend usage

```typescript
const response = await fetch('/api/will', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ willText }),
}).then(r => r.json())

// Show deployed vault
console.log('Vault deployed at:', response.contractAddress)
console.log('Basescan:', `https://sepolia.basescan.org/address/${response.contractAddress}`)

// Display resolved beneficiaries for confirmation UI
response.beneficiaries.forEach(b => {
  console.log(`${b.name}: ${b.basisPoints / 100}% → ${b.walletAddress}`)
})
```

> **Important**: After this call succeeds, the user should send ETH (or ERC-20 tokens) directly to `contractAddress` to fund the vault. The contract's `receive()` function accepts ETH with no additional call data.

---

## 3. Check-In

### 3.1 `POST /api/check-in`

🔒 **Auth required**

**Purpose**: Records a "I'm alive" check-in for the authenticated user. Resets the countdown timer to `now + intervalDays` (default: 30 days). This is the main action the user performs on a regular basis — if they miss it for more than `intervalDays + gracePeriodDays` (default: 37 days total), their vault is automatically triggered.

**Auth required**: Yes

#### Request Body

None — the user is identified from the JWT.

#### Response `200 OK`

```json
{
  "nextDueAt": "2026-04-20T12:00:00Z",
  "intervalDays": 30
}
```

| Field          | Type              | Description                                                  |
|----------------|-------------------|--------------------------------------------------------------|
| `nextDueAt`    | `string` (ISO 8601) | UTC timestamp of the next required check-in deadline       |
| `intervalDays` | `number`          | How many days between required check-ins (default: 30)       |

#### Error responses

| Status | Condition                                          |
|--------|----------------------------------------------------|
| `401`  | Missing or expired JWT                             |
| `404`  | User has not submitted a will yet (no config found)|

#### Frontend usage

```typescript
// "I'm alive" button handler
const checkIn = await fetch('/api/check-in', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
}).then(r => r.json())

// Update countdown display
setNextDueAt(new Date(checkIn.nextDueAt))
```

---

### 3.2 `GET /api/check-in/status`

🔒 **Auth required**

**Purpose**: Returns the current check-in status for the authenticated user. Used to populate the dashboard countdown timer and determine urgency styling.

#### Request Body

None.

#### Response `200 OK`

```json
{
  "nextDueAt": "2026-04-20T12:00:00Z",
  "daysRemaining": 29,
  "status": "ACTIVE"
}
```

| Field            | Type              | Description                                                                     |
|------------------|-------------------|---------------------------------------------------------------------------------|
| `nextDueAt`      | `string` (ISO 8601) | UTC timestamp of the next required check-in                                   |
| `daysRemaining`  | `number`          | Days until the deadline (can be negative if overdue)                            |
| `status`         | `string`          | `"ACTIVE"` · `"GRACE"` · `"TRIGGERED"` · `"REVOKED"` — see status table below |

#### Status values

| Status      | Meaning                                                                                         |
|-------------|-------------------------------------------------------------------------------------------------|
| `ACTIVE`    | All good — user is within their check-in window                                                 |
| `GRACE`     | Missed the deadline — in the grace period (default: 7 days). Still time to check in and recover |
| `TRIGGERED` | Grace period expired — vault has been triggered and funds distributed                           |
| `REVOKED`   | User called `revoke()` directly on the vault contract — assets returned to owner                |

#### Error responses

| Status | Condition                                          |
|--------|----------------------------------------------------|
| `401`  | Missing or expired JWT                             |
| `404`  | No check-in config found (will not yet submitted)  |

#### Frontend usage

```typescript
const status = await fetch('/api/check-in/status', {
  headers: { 'Authorization': `Bearer ${token}` },
}).then(r => r.json())

// Colour the countdown based on urgency
const urgency =
  status.daysRemaining <= 3  ? 'text-red-500'   :
  status.daysRemaining <= 7  ? 'text-amber-500' :
                               'text-green-500'
```

---

---

## 4. Vault

### 4.1 `PUT /api/will`

🔒 **Auth required**

**Purpose**: Updates an existing will with new beneficiary instructions. Because vault contracts are
immutable on-chain, this endpoint deploys a **new vault** with the updated configuration.

**Important — `revoke()` is owner-only**: The old vault's `revoke()` function has an `onlyOwner`
modifier where `owner` is the **user's wallet**, not the backend hot wallet. The backend cannot
call `revoke()` on the user's behalf. The recommended flow is:

1. Call `PUT /api/will` — backend validates the new text, deploys the new vault, returns both addresses
2. User calls `revoke()` directly on `oldContractAddress` via MetaMask (wagmi `writeContract`) — ETH returns to their wallet
3. User sends ETH to `newContractAddress` to fund the new vault

The check-in countdown is **not reset** — the deadline continues uninterrupted.

#### Request Body

Same as `POST /api/will`:

```json
{
  "willText": "Split equally between Alice (0xAAA...), Bob (0xBBB...) and Charlie (0xCCC...)"
}
```

#### Response `200 OK`

```json
{
  "newConfigId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "templateType": "EQUAL_SPLIT",
  "beneficiaries": [
    { "name": "Alice", "walletAddress": "0xAAA...", "basisPoints": 3334, "condition": "ALWAYS", "timeLockDays": 0 },
    { "name": "Bob",   "walletAddress": "0xBBB...", "basisPoints": 3333, "condition": "ALWAYS", "timeLockDays": 0 },
    { "name": "Charlie", "walletAddress": "0xCCC...", "basisPoints": 3333, "condition": "ALWAYS", "timeLockDays": 0 }
  ],
  "oldContractAddress": "0xOLD_VAULT_ADDRESS",
  "revokeTxHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "newContractAddress": "0xNEW_VAULT_ADDRESS",
  "deploymentTxHash": "0xDEPLOY_TX_HASH"
}
```

| Field                | Type                  | Description                                                                 |
|----------------------|-----------------------|-----------------------------------------------------------------------------|
| `newConfigId`        | `string` (UUID)       | Internal ID of the new beneficiary config                                   |
| `templateType`       | `string`              | Vault type of the newly deployed contract                                   |
| `beneficiaries`      | `Beneficiary[]`       | Resolved beneficiary list from the new will text                            |
| `oldContractAddress` | `string`              | The now-inactive old vault — call `revoke()` on this address from MetaMask  |
| `revokeTxHash`       | `string`              | Revoke tx hash (or placeholder if frontend handles the revoke call)         |
| `newContractAddress` | `string`              | The newly deployed vault — re-fund this address with ETH                   |
| `deploymentTxHash`   | `string`              | New vault deployment transaction hash                                       |

#### Error responses

| Status | Condition                                                           |
|--------|---------------------------------------------------------------------|
| `400`  | Validation failure or LLM could not resolve addresses               |
| `401`  | Missing or expired JWT                                              |
| `404`  | No vault exists yet — use `POST /api/will` first                    |
| `409`  | Vault already triggered or mid-trigger — cannot update             |
| `500`  | Blockchain error on revoke or new deployment                        |

#### Frontend usage

```typescript
// Step 1 — call backend to deploy new vault
const update = await apiFetch('/api/will', {
  method: 'PUT',
  body: JSON.stringify({ willText: newWillText }),
})

// Step 2 — user calls revoke() on old vault directly from their wallet
await writeContract({
  address: update.oldContractAddress as `0x${string}`,
  abi: DMSVaultAbi,
  functionName: 'revoke',
})

// Step 3 — prompt user to send ETH to new vault
console.log('Please fund your new vault:', update.newContractAddress)
```

---

### 4.2 `GET /api/vault/balance`

🔒 **Auth required**

**Purpose**: Returns the current ETH balance of the user's deployed vault, plus optional ERC-20
token balances. All reads are free view calls — no gas, no signing.

#### Query Parameters

| Parameter | Type       | Required | Description                                                   |
|-----------|------------|----------|---------------------------------------------------------------|
| `tokens`  | `string[]` | No       | Repeatable — ERC-20 contract addresses to check on Base       |

#### Request

```http
# ETH only
GET /api/vault/balance

# ETH + USDC + WETH
GET /api/vault/balance?tokens=0xUSDC_ON_BASE&tokens=0xWETH_ON_BASE
```

#### Response `200 OK`

```json
{
  "contractAddress": "0xVAULT_ADDRESS",
  "ethBalanceWei": "50000000000000000",
  "ethBalanceEther": "0.05",
  "tokens": [
    {
      "tokenAddress": "0xUSDC_ON_BASE",
      "symbol": "USDC",
      "balanceRaw": "10000000",
      "balanceFormatted": "10.0",
      "decimals": 6
    }
  ]
}
```

| Field             | Type             | Description                                                              |
|-------------------|------------------|--------------------------------------------------------------------------|
| `contractAddress` | `string`         | The vault address on Base                                                |
| `ethBalanceWei`   | `string`         | Raw ETH balance in wei — use for on-chain calculations                   |
| `ethBalanceEther` | `string`         | Human-readable ETH (6 decimal places max, trailing zeros stripped)       |
| `tokens`          | `TokenBalance[]` | One entry per `tokens` query param (empty array if none supplied)        |

#### `TokenBalance` object

| Field              | Type     | Description                                              |
|--------------------|----------|----------------------------------------------------------|
| `tokenAddress`     | `string` | The ERC-20 contract address                              |
| `symbol`           | `string` | Token symbol (e.g. `"USDC"`)                             |
| `balanceRaw`       | `string` | Raw balance as returned by `balanceOf()` (integer string)|
| `balanceFormatted` | `string` | Human-readable balance adjusted for token decimals       |
| `decimals`         | `number` | Token decimal places (e.g. `6` for USDC, `18` for WETH) |

#### Error responses

| Status | Condition                                          |
|--------|----------------------------------------------------|
| `401`  | Missing or expired JWT                             |
| `404`  | No vault found — user has not submitted a will yet |
| `500`  | Base RPC error                                     |

#### Frontend usage

```typescript
const balance = await apiFetch('/api/vault/balance')

// Display ETH balance
console.log(`Vault holds: ${balance.ethBalanceEther} ETH`)

// Display token balances
balance.tokens.forEach(t => {
  console.log(`${t.symbol}: ${t.balanceFormatted}`)
})

// Urgency: warn user if vault is unfunded
if (balance.ethBalanceWei === '0' && balance.tokens.length === 0) {
  showWarning('Your vault is empty — send ETH to activate your inheritance plan.')
}
```

## 5. Health

### 5.1 `GET /actuator/health`

**Purpose**: Spring Boot Actuator health check. Used by Docker Compose `healthcheck` and any uptime monitors. No auth required.

#### Response `200 OK`

```json
{
  "status": "UP",
  "components": {
    "db": { "status": "UP" },
    "diskSpace": { "status": "UP" }
  }
}
```

---

## 6. Error Responses

All error responses follow a consistent shape:

```json
{
  "error": "Human-readable description of what went wrong"
}
```

#### HTTP status codes used

| Code  | Meaning                                                               |
|-------|-----------------------------------------------------------------------|
| `200` | Success                                                               |
| `400` | Bad request — validation failure or unprocessable will text           |
| `401` | Unauthorised — missing, expired, or invalid JWT / bad SIWE signature  |
| `404` | Resource not found — e.g. no will submitted yet                       |
| `500` | Server error — blockchain RPC failure, OpenAI timeout, etc.           |

#### Handling `401` in the frontend

```typescript
async function apiFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('dms_token')
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('dms_token')
    window.location.href = '/login'
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? 'Unknown error')
  }
  return res.json()
}
```

---

## 7. End-to-End Flow

This is the complete sequence from wallet connect to a funded, monitored vault:

```
1. Wallet connects (MetaMask / wagmi)
        │
        ▼
2. GET /api/auth/nonce?walletAddress=0x...
        │  ← { walletAddress, nonce }
        ▼
3. wallet.signMessage("Sign in to Dead Man's Switch\nWallet: 0x...\nNonce: <nonce>")
        │  ← signature (hex string)
        ▼
4. POST /api/auth/verify  { walletAddress, nonce, signature }
        │  ← { token }   — store in localStorage
        ▼
5. POST /api/will  { willText: "Give 60% to Alice (0x...) and 40% to Bob (0x...)" }
   Authorization: Bearer <token>
        │  ← { configId, templateType, beneficiaries, contractAddress, deploymentTxHash }
        ▼
6. User sends ETH to contractAddress via MetaMask (direct transfer, no calldata)
        │
        ▼
7. Dashboard polling loop:
   GET /api/check-in/status  →  show countdown timer + status badge
        │
        ▼
8. User clicks "I'm alive":
   POST /api/check-in  →  reset countdown
        │
        ▼
9. If user misses check-in:
   Scheduler moves status → GRACE (7-day warning window)
   GET /api/check-in/status returns status: "GRACE"
        │
        ▼
10. If grace period expires:
    Scheduler calls vault.trigger() on-chain
    GET /api/check-in/status returns status: "TRIGGERED"
    Funds distributed to beneficiaries on Base
```

---

## 8. Type Reference

Quick reference for all types used across request and response bodies.

### `NonceResponse`
```typescript
interface NonceResponse {
  walletAddress: string   // "0x..."
  nonce: string           // UUID string
}
```

### `TokenResponse`
```typescript
interface TokenResponse {
  token: string           // JWT — attach as "Bearer <token>"
}
```

### `VerifyRequest`
```typescript
interface VerifyRequest {
  walletAddress: string   // "0x..." — must match nonce request
  nonce: string           // from NonceResponse
  signature: string       // "0x..." — 130–134 hex chars from wallet sign
}
```

### `WillRequest`
```typescript
interface WillRequest {
  willText: string        // plain English, 10–2000 chars
}
```

### `WillResponse`
```typescript
interface WillResponse {
  configId: string             // UUID
  templateType: TemplateType
  beneficiaries: Beneficiary[]
  contractAddress: string      // "0x..." — deployed vault on Base
  deploymentTxHash: string     // "0x..." — link to Basescan
}

type TemplateType =
  | 'EQUAL_SPLIT'
  | 'PERCENTAGE_SPLIT'
  | 'TIME_LOCKED'
  | 'CONDITIONAL_SURVIVAL'
```

### `Beneficiary`
```typescript
interface Beneficiary {
  name: string            // extracted from will text
  walletAddress: string   // "0x..."
  basisPoints: number     // 0–10000 (divide by 100 for percentage)
  condition: 'ALWAYS' | 'CONDITIONAL_SURVIVAL'
  timeLockDays: number    // 0 unless templateType === 'TIME_LOCKED'
}
```

### `CheckInResponse`
```typescript
interface CheckInResponse {
  nextDueAt: string       // ISO 8601 UTC — e.g. "2026-04-20T12:00:00Z"
  intervalDays: number    // default 30
}
```

### `CheckInStatusResponse`
```typescript
interface CheckInStatusResponse {
  nextDueAt: string       // ISO 8601 UTC
  daysRemaining: number   // can be negative if overdue
  status: CheckInStatus
}

type CheckInStatus = 'ACTIVE' | 'GRACE' | 'TRIGGERED' | 'REVOKED'
```

### `UpdateWillResponse`
```typescript
interface UpdateWillResponse {
  newConfigId: string          // UUID of new beneficiary config
  templateType: TemplateType
  beneficiaries: Beneficiary[]
  oldContractAddress: string   // call revoke() on this from MetaMask
  revokeTxHash: string         // placeholder if frontend handles revoke
  newContractAddress: string   // re-fund this address
  deploymentTxHash: string
```

### `VaultBalanceResponse`
```typescript
interface VaultBalanceResponse {
  contractAddress: string
  ethBalanceWei: string        // raw wei as string (use BigInt for arithmetic)
  ethBalanceEther: string      // formatted e.g. "0.05"
  tokens: TokenBalance[]
}

interface TokenBalance {
  tokenAddress: string
  symbol: string
  balanceRaw: string           // raw integer string
  balanceFormatted: string     // human-readable e.g. "10.0"
  decimals: number
```
