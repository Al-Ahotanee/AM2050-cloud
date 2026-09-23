#!/bin/bash
# ==============================================================================
# AM2050 - Azure VM Standard_B1s Automated Provisioning Script
# Operating System: Ubuntu 22.04 / 24.04 LTS
# Free Tier Compliance: Azure for Students (Standard_B1s + 2GB Swap)
# ==============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: sudo bash setup-vm.sh <your-domain.region.cloudapp.azure.com> <your-email@example.com>"
    echo "Example: sudo bash setup-vm.sh am2050.westeurope.cloudapp.azure.com admin@am2050.org"
    exit 1
fi

echo "=========================================================="
echo ">> Step 1/7: Configuring 2GB Swap Space (Essential for B1s)..."
echo "=========================================================="
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo ">> Swap space successfully created and enabled."
else
    echo ">> Swapfile already exists. Skipping."
fi

echo "=========================================================="
echo ">> Step 2/7: Updating System & Installing Prerequisites..."
echo "=========================================================="
apt-get update -y
apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw \
    htop \
    jq

echo "=========================================================="
echo ">> Step 3/7: Installing Official Docker Engine & Compose..."
echo "=========================================================="
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo ">> Docker installed successfully."
fi

echo "=========================================================="
echo ">> Step 4/7: Configuring UFW Firewall..."
echo "=========================================================="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=========================================================="
echo ">> Step 5/7: Setting Up Repository in /opt/am2050..."
echo "=========================================================="
mkdir -p /opt/am2050
if [ ! -d "/opt/am2050/.git" ]; then
    git clone https://github.com/Al-Ahotanee/AM2050-cloud.git /opt/am2050
else
    cd /opt/am2050
    git pull origin main
fi

cd /opt/am2050

echo "=========================================================="
echo ">> Step 6/7: Obtaining Let's Encrypt SSL Certificate..."
echo "=========================================================="
systemctl stop nginx || true
certbot certonly --standalone \
    -d "$DOMAIN" \
    --agree-tos \
    -m "$EMAIL" \
    --non-interactive \
    --cert-name am2050

# Configure Nginx
cp deployment/azure/nginx-am2050.conf /etc/nginx/sites-available/am2050.conf
sed -i "s/server_name _;/server_name ${DOMAIN};/g" /etc/nginx/sites-available/am2050.conf

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/am2050.conf /etc/nginx/sites-enabled/am2050.conf

nginx -t
systemctl restart nginx
systemctl enable nginx

echo "=========================================================="
echo ">> Step 7/7: Environment Configuration Reminder..."
echo "=========================================================="
echo "IMPORTANT: Create /opt/am2050/.env with your Azure MySQL credentials:"
echo "----------------------------------------------------------"
echo "APP_URL=https://${DOMAIN}"
echo "DB_HOST=<your-azure-mysql-server>.mysql.database.azure.com"
echo "DB_PORT=3306"
echo "DB_NAME=am2050_production"
echo "DB_USER=<your-db-admin>"
echo "DB_PASS=<your-db-password>"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "CLOUDINARY_CLOUD_NAME=dxnbuqcfy"
echo "CLOUDINARY_API_KEY=346594288951922"
echo "CLOUDINARY_API_SECRET=ZyOV7-jT3MW-ks_LyIlDjCRfK5E"
echo "----------------------------------------------------------"
echo "Once created, run:"
echo "cd /opt/am2050 && docker compose -f deployment/azure/docker-compose.azure.yml up -d --build"
echo "=========================================================="
echo "Setup script completed successfully!"
