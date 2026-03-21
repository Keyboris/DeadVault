# DeadVault — API Reference

**Base URL**: `http://localhost:8080` (dev) · `https://your-domain.com` (prod)  
**Content-Type**: `application/json` for all request and response bodies  
**Auth**: All endpoints marked 🔒 require `Authorization: Bearer <token>` in the request header. Obtain the token from `POST /api/auth/verify`.

---

## Table of Contents

1. [Authentication](#1-authentication)
   - [GET /api/auth/nonce](#11-get-apiauthnonce)
   - [POST /api/auth/verify](#12-post-apiauthverify)
2. [Will (Vault Setup)](#2-will-vault-setup)
   - [POST /api/will](#21-post-apiwill)
3. [Check-In](#3-check-in)
   - [POST /api/check-in](#31-post-apicheck-in)
   - [GET /api/check-in/status](#32-get-apicheck-instatus)
4. [Vault](#4-vault)
   - [PUT /api/will](#41-put-apiwill)
   - [GET /api/vault/balance](#42-get-apivaultbalance)
5. [Contracts](#5-contracts)
   - [GET /api/contracts](#51-get-apicontracts)
6. [Health](#6-health)
   - [GET /actuator/health](#61-get-actuatorhealth)
7. [Error Responses](#7-error-responses)
8. [End-to-End Flow](#8-end-to-end-flow)
9. [Type Reference](#9-type-reference)

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
| `deploymentTxHash`  | `string`              | Deployment transaction hash                                                 |

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

console.log('Vault deployed at:', response.contractAddress)
console.log('Basescan:', `https://sepolia.basescan.org/address/${response.contractAddress}`)

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

setNextDueAt(new Date(checkIn.nextDueAt))
```

---

### 3.2 `GET /api/check-in/status`

🔒 **Auth required**

**Purpose**: Returns the full check-in status for the authenticated user. The response includes all fields needed to render a precise real-time countdown clock client-side — no WebSocket required. Poll this endpoint every 60 seconds; the clock ticks via `setInterval` on the frontend.

#### Request Body

None.

#### Response `200 OK`

```json
{
  "lastCheckInAt":    "2026-03-21T10:00:00Z",
  "nextDueAt":        "2026-04-20T10:00:00Z",
  "secondsRemaining": 2591940,
  "intervalDays":     30,
  "gracePeriodDays":  7,
  "status":           "ACTIVE"
}
```

| Field              | Type              | Description                                                                                      |
|--------------------|-------------------|--------------------------------------------------------------------------------------------------|
| `lastCheckInAt`    | `string` (ISO 8601) | UTC timestamp when the current interval started — use as the clock's start anchor              |
| `nextDueAt`        | `string` (ISO 8601) | UTC timestamp when the interval expires — the countdown target                                 |
| `secondsRemaining` | `number`          | Precise seconds until `nextDueAt`. **Negative** if overdue — frontend can show "LATE" state    |
| `intervalDays`     | `number`          | Total interval length in days — denominator for the progress ring (`intervalDays × 86400` = total seconds) |
| `gracePeriodDays`  | `number`          | Grace window after missing — turn the clock orange when `secondsRemaining < gracePeriodDays × 86400` |
| `status`           | `string`          | `"ACTIVE"` · `"GRACE"` · `"TRIGGERED"` · `"REVOKED"` — see status table below                  |

> **Breaking change from v1**: The old `daysRemaining` field has been replaced by `secondsRemaining`
> for sub-day precision. Update any frontend code reading `daysRemaining`.

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

#### Frontend countdown clock usage

```typescript
// React hook — fetch once, tick client-side, refresh every 60s
function useCountdown(token: string) {
  const { data } = useQuery({
    queryKey: ['checkInStatus'],
    queryFn: () => apiFetch('/api/check-in/status'),
    refetchInterval: 60_000,
  })

  const [secondsLeft, setSecondsLeft] = useState(data?.secondsRemaining ?? 0)

  useEffect(() => {
    if (data) setSecondsLeft(data.secondsRemaining)
  }, [data])

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Progress ring — how far through the current interval are we?
  const totalSeconds    = (data?.intervalDays ?? 30) * 86_400
  const progressPercent = Math.min(100, ((totalSeconds - secondsLeft) / totalSeconds) * 100)

  // Colour thresholds
  const graceThreshold = (data?.gracePeriodDays ?? 7) * 86_400
  const isWarning = secondsLeft < graceThreshold
  const isDead    = data?.status === 'GRACE' || data?.status === 'TRIGGERED'

  return { secondsLeft, progressPercent, isWarning, isDead, status: data?.status }
}

// Format helper
function formatCountdown(s: number): string {
  const abs  = Math.abs(s)
  const days = Math.floor(abs / 86_400)
  const hrs  = Math.floor((abs % 86_400) / 3_600)
  const mins = Math.floor((abs % 3_600) / 60)
  const secs = abs % 60
  const sign = s < 0 ? '-' : ''
  return `${sign}${days}d ${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
}
```

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
    { "name": "Alice",   "walletAddress": "0xAAA...", "basisPoints": 3334, "condition": "ALWAYS", "timeLockDays": 0 },
    { "name": "Bob",     "walletAddress": "0xBBB...", "basisPoints": 3333, "condition": "ALWAYS", "timeLockDays": 0 },
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
| `revokeTxHash`       | `string`              | Revoke tx hash (or zero hash if frontend handles the revoke call)           |
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
const update = await apiFetch('/api/will', {
  method: 'PUT',
  body: JSON.stringify({ willText: newWillText }),
})

// User calls revoke() on old vault directly from their wallet
await writeContract({
  address: update.oldContractAddress as `0x${string}`,
  abi: DMSVaultAbi,
  functionName: 'revoke',
})

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

#### Error responses

| Status | Condition                                          |
|--------|----------------------------------------------------|
| `401`  | Missing or expired JWT                             |
| `404`  | No vault found — user has not submitted a will yet |
| `500`  | Base RPC error                                     |

#### Frontend usage

```typescript
const balance = await apiFetch('/api/vault/balance')

console.log(`Vault holds: ${balance.ethBalanceEther} ETH`)

if (balance.ethBalanceWei === '0' && balance.tokens.length === 0) {
  showWarning('Your vault is empty — send ETH to activate your inheritance plan.')
}
```

---

## 5. Contracts

### 5.1 `GET /api/contracts`

🔒 **Auth required**

**Purpose**: Returns all non-revoked vaults for the authenticated user, each enriched with its
full beneficiary list. The frontend uses this to render the vault card grid, display which assets
are at stake, and provide Basescan links.

An **empty array** means the user has not submitted a will yet — the frontend should show the
"Write your will" onboarding prompt.

Vaults with `status = "REVOKED"` are excluded. `ACTIVE`, `TRIGGERING`, and `TRIGGERED` vaults
are all returned so the user can see both their live vault and any historical triggered vaults.

#### Request

```http
GET /api/contracts
Authorization: Bearer <token>
```

No query parameters, no request body.

#### Response `200 OK`

```json
[
  {
    "id": "f1e2d3c4-b5a6-7890-abcd-123456789abc",
    "contractAddress": "0xVAULT_ADDRESS_1",
    "deploymentTxHash": "0xDEPLOY_TX_HASH_1",
    "vaultType": "STANDARD",
    "status": "ACTIVE",
    "deployedAt": "2026-03-01T12:00:00Z",
    "beneficiaries": [
      {
        "label": "Alice",
        "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "basisPoints": 6000,
        "condition": "ALWAYS"
      },
      {
        "label": "Bob",
        "walletAddress": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "basisPoints": 4000,
        "condition": "ALWAYS"
      }
    ]
  }
]
```

The response is an **array** of `ContractSummaryResponse` objects ordered by `deployedAt` descending (most recent first).

#### `ContractSummaryResponse` object

| Field               | Type                    | Description                                                                           |
|---------------------|-------------------------|---------------------------------------------------------------------------------------|
| `id`                | `string` (UUID)         | Internal database ID of the contract record                                           |
| `contractAddress`   | `string`                | On-chain vault address — link to `https://sepolia.basescan.org/address/<address>`    |
| `deploymentTxHash`  | `string`                | Deployment transaction hash — link to `https://sepolia.basescan.org/tx/<hash>`       |
| `vaultType`         | `string`                | `"STANDARD"` · `"TIME_LOCKED"` · `"CONDITIONAL_SURVIVAL"` — display as a badge       |
| `status`            | `string`                | `"ACTIVE"` (green) · `"TRIGGERING"` (amber) · `"TRIGGERED"` (red)                   |
| `deployedAt`        | `string` (ISO 8601)     | UTC timestamp of deployment — display as "deployed X days ago"                       |
| `beneficiaries`     | `BeneficiarySummary[]`  | Ordered list of beneficiaries (0-based, mirrors on-chain array position)             |

#### `BeneficiarySummary` object

| Field           | Type     | Description                                                                    |
|-----------------|----------|--------------------------------------------------------------------------------|
| `label`         | `string` | Human-readable name extracted by LangChain4j at will submission time           |
| `walletAddress` | `string` | `0x...` — the on-chain recipient address                                       |
| `basisPoints`   | `number` | Share out of 10000 — divide by 100 for percentage display                     |
| `condition`     | `string` | `"ALWAYS"` — unconditional · `"CONDITIONAL_SURVIVAL"` — requires alive proof  |

#### Error responses

| Status | Condition                          |
|--------|------------------------------------|
| `401`  | Missing or expired JWT             |

> A `404` is **not** returned when no vaults exist — an empty array `[]` is returned instead.
> This simplifies frontend logic (no error handling needed for the "no will yet" state).

#### Frontend usage

```typescript
// Fetch on dashboard load
const contracts = await apiFetch('/api/contracts')

if (contracts.length === 0) {
  return <OnboardingPrompt />
}

// Render vault cards
contracts.map(vault => (
  <VaultCard
    key={vault.id}
    address={vault.contractAddress}
    vaultType={vault.vaultType}
    status={vault.status}
    deployedAt={vault.deployedAt}
    beneficiaries={vault.beneficiaries}
    basescanUrl={`https://sepolia.basescan.org/address/${vault.contractAddress}`}
  />
))

// React Query polling (30s stale — contracts change rarely)
const { data: contracts } = useQuery({
  queryKey: ['contracts'],
  queryFn: () => apiFetch('/api/contracts'),
  staleTime: 30_000,
})
```

---

## 6. Health

### 6.1 `GET /actuator/health`

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

## 7. Error Responses

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
| `409` | Conflict — e.g. attempting to update an already-triggered vault       |
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

## 8. End-to-End Flow

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
5. GET /api/contracts
        │  ← [] (empty — first visit) → show onboarding
        ▼
6. POST /api/will  { willText: "Give 60% to Alice (0x...) and 40% to Bob (0x...)" }
   Authorization: Bearer <token>
        │  ← { configId, templateType, beneficiaries, contractAddress, deploymentTxHash }
        ▼
7. User sends ETH to contractAddress via MetaMask (direct transfer, no calldata)
        │
        ▼
8. Dashboard polling loop:
   GET /api/check-in/status  →  { lastCheckInAt, nextDueAt, secondsRemaining, intervalDays, gracePeriodDays, status }
   GET /api/contracts        →  show vault cards with beneficiary list
        │
        ▼
9. User clicks "I'm alive":
   POST /api/check-in  →  reset countdown (nextDueAt advances by intervalDays)
        │
        ▼
10. If user misses check-in:
    Scheduler moves status → GRACE (7-day warning window)
    GET /api/check-in/status returns status: "GRACE", secondsRemaining is small or negative
        │
        ▼
11. If grace period expires:
    Scheduler calls vault.trigger() on-chain
    GET /api/check-in/status returns status: "TRIGGERED"
    GET /api/contracts returns vault with status: "TRIGGERED"
    Funds distributed to beneficiaries on Base
```

---

## 9. Type Reference

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
  lastCheckInAt:    string        // ISO 8601 UTC — clock start anchor
  nextDueAt:        string        // ISO 8601 UTC — countdown target
  secondsRemaining: number        // precise; negative = overdue
  intervalDays:     number        // total period length (progress ring denominator)
  gracePeriodDays:  number        // warn when secondsRemaining < gracePeriodDays * 86400
  status:           CheckInStatus
}

type CheckInStatus = 'ACTIVE' | 'GRACE' | 'TRIGGERED' | 'REVOKED'
```

### `UpdateWillResponse`
```typescript
interface UpdateWillResponse {
  newConfigId:         string          // UUID of new beneficiary config
  templateType:        TemplateType
  beneficiaries:       Beneficiary[]
  oldContractAddress:  string          // call revoke() on this from MetaMask
  revokeTxHash:        string
  newContractAddress:  string          // re-fund this address
  deploymentTxHash:    string
}
```

### `VaultBalanceResponse`
```typescript
interface VaultBalanceResponse {
  contractAddress: string
  ethBalanceWei:   string        // raw wei as string (use BigInt for arithmetic)
  ethBalanceEther: string        // formatted e.g. "0.05"
  tokens:          TokenBalance[]
}

interface TokenBalance {
  tokenAddress:     string
  symbol:           string
  balanceRaw:       string       // raw integer string
  balanceFormatted: string       // human-readable e.g. "10.0"
  decimals:         number
}
```

### `ContractSummaryResponse`
```typescript
interface ContractSummaryResponse {
  id:               string                // UUID — internal DB id
  contractAddress:  string                // "0x..." — on-chain vault
  deploymentTxHash: string                // "0x..." — link to Basescan
  vaultType:        VaultType
  status:           ContractStatus
  deployedAt:       string                // ISO 8601 UTC
  beneficiaries:    BeneficiarySummary[]
}

type VaultType     = 'STANDARD' | 'TIME_LOCKED' | 'CONDITIONAL_SURVIVAL'
type ContractStatus = 'ACTIVE' | 'TRIGGERING' | 'TRIGGERED'
```

### `BeneficiarySummary`
```typescript
interface BeneficiarySummary {
  label:          string   // human-readable name from LangChain4j extraction
  walletAddress:  string   // "0x..."
  basisPoints:    number   // 0–10000
  condition:      'ALWAYS' | 'CONDITIONAL_SURVIVAL'
}
```
