#!/bin/bash
# deploy-all.sh
# Deploys both DeadVault factories and updates the root .env file.

ROOT_DIR=$(pwd)
ENV_FILE="$ROOT_DIR/.env"

echo "🚀 Starting full contract deployment..."

# 1. Deploy Standard DMSFactory
echo "-------------------------------------------------"
echo "📦 Deploying Standard DMSFactory..."
cd "$ROOT_DIR/contracts" || exit
DMS_OUT=$(npx hardhat run scripts/deploy.js --network localhost)
echo "$DMS_OUT"

DMS_ADDR=$(echo "$DMS_OUT" | grep "FACTORY_CONTRACT_ADDRESS=" | cut -d'=' -f2 | tr -d '\r\n')

# 2. Deploy MultiSigFactory
echo "-------------------------------------------------"
echo "📦 Deploying MultiSigFactory..."
cd "$ROOT_DIR/multisig" || exit
MS_OUT=$(npx hardhat run scripts/deploy.js --network localhost)
echo "$MS_OUT"

MS_ADDR=$(echo "$MS_OUT" | grep "MULTISIG_FACTORY_ADDRESS=" | cut -d'=' -f2 | tr -d '\r\n')

# 3. Update .env
echo "-------------------------------------------------"
if [ -f "$ENV_FILE" ]; then
    echo "📝 Updating $ENV_FILE..."
    
    # Use temporary file for portability across sed versions
    sed -e "s/^FACTORY_CONTRACT_ADDRESS=.*/FACTORY_CONTRACT_ADDRESS=$DMS_ADDR/" \
        -e "s/^MULTISIG_FACTORY_ADDRESS=.*/MULTISIG_FACTORY_ADDRESS=$MS_ADDR/" \
        "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    
    echo "✅ .env updated successfully:"
    echo "   FACTORY_CONTRACT_ADDRESS=$DMS_ADDR"
    echo "   MULTISIG_FACTORY_ADDRESS=$MS_ADDR"
else
    echo "⚠️  .env file not found at $ENV_FILE - skipping update."
fi

echo "-------------------------------------------------"
echo "✨ Deployment complete! Remember to restart your backend:"
echo "   docker compose up --build"
