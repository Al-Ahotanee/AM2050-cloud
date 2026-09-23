# AM2050 - Azure for Students Deployment Guide (Architecture 1)

This guide documents the complete procedure for deploying **AM2050** to **Microsoft Azure for Students** at **$0.00 cost** using **Architecture 1: Decoupled Compute & Managed Database**.

---

## 1. Free Tier Resource Checklist

Under the **Azure for Students** subscription ($100 annual credit + 12 months free services):

| Resource | Service | Approved SKU / Size | Monthly Allowance | Cost |
|---|---|---|---|---|
| **Compute** | Azure Linux VM (Ubuntu 24.04) | `Standard_B1s` (1 vCPU, 1 GB RAM, 64 GB SSD) | 750 Hours / month | **$0.00** |
| **Database** | Azure Database for MySQL Flexible Server | Burstable `Standard_B1ms` (1 vCore, 2 GB RAM, 32 GB Storage) | 750 Hours / month | **$0.00** |
| **DNS Domain** | Azure Public IP DNS Name Label | `<custom-name>.<region>.cloudapp.azure.com` | Unlimited | **$0.00** |
| **SSL Certificate**| Let's Encrypt via Certbot | 2048-bit RSA / ECDSA | Auto-renewing | **$0.00** |
| **CI/CD** | GitHub Actions | Standard Ubuntu Runner | 2,000 mins / month | **$0.00** |

---

## 2. Option A: Rapid Provisioning via Azure CLI / Cloud Shell

Open [Azure Cloud Shell](https://shell.azure.com) (Bash) and run the following commands:

```bash
# 1. Variables
RESOURCE_GROUP="rg-am2050-prod"
LOCATION="westeurope"           # Or 'northeurope', 'francecentral', etc.
DB_SERVER_NAME="am2050-mysql-$RANDOM"
DB_ADMIN_USER="am2050admin"
DB_ADMIN_PASSWORD="SecurePassword2050!"  # Must contain uppercase, lowercase, numbers, symbol
VM_NAME="vm-am2050-app"
VM_ADMIN_USER="azureuser"
DNS_LABEL="am2050"              # Your URL will be: am2050.<location>.cloudapp.azure.com

# 2. Create Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 3. Create Azure Database for MySQL Flexible Server (Burstable B1ms - Free Tier)
az mysql flexible-server create \
    --resource-group $RESOURCE_GROUP \
    --name $DB_SERVER_NAME \
    --location $LOCATION \
    --admin-user $DB_ADMIN_USER \
    --admin-password "$DB_ADMIN_PASSWORD" \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --storage-size 32 \
    --version 8.0.21 \
    --public-access All

# Create production database schema
az mysql flexible-server db create \
    --resource-group $RESOURCE_GROUP \
    --server-name $DB_SERVER_NAME \
    --database-name am2050_production

# 4. Create Azure VM (Standard_B1s - Free Tier) with Public IP & DNS Label
az vm create \
    --resource-group $RESOURCE_GROUP \
    --name $VM_NAME \
    --image Ubuntu2404 \
    --size Standard_B1s \
    --admin-username $VM_ADMIN_USER \
    --generate-ssh-keys \
    --public-ip-address-dns-name $DNS_LABEL \
    --os-disk-size-gb 64

# Open HTTP, HTTPS, and SSH ports on Network Security Group
az vm open-port --resource-group $RESOURCE_GROUP --name $VM_NAME --port 80 --priority 1001
az vm open-port --resource-group $RESOURCE_GROUP --name $VM_NAME --port 443 --priority 1002
az vm open-port --resource-group $RESOURCE_GROUP --name $VM_NAME --port 22 --priority 1003

# Output Connection Details
echo "=========================================================="
echo "AM2050 Azure Infrastructure Successfully Created!"
echo "Domain: ${DNS_LABEL}.${LOCATION}.cloudapp.azure.com"
echo "Database Host: ${DB_SERVER_NAME}.mysql.database.azure.com"
echo "Database User: ${DB_ADMIN_USER}"
echo "Database Name: am2050_production"
echo "=========================================================="
```

---

## 3. Option B: Azure Portal (Click-by-Click)

### Step 3.1: Create MySQL Flexible Server
1. In Azure Portal, search for **Azure Database for MySQL flexible servers** -> click **Create**.
2. **Server name**: `am2050-mysql` (or unique name).
3. **Region**: `West Europe` (or your nearest region).
4. **Workload type**: Select **For small or medium workloads**.
5. **Compute + storage**: Click **Configure server**:
   - Compute tier: **Burstable**
   - Compute size: **Standard_B1ms (1 vCore, 2 GiB memory)**.
   - Storage size: **32 GiB**.
   - Auto-grow: Leave unchecked or 32GB.
   - Click **Save**.
6. **Authentication**: Set **Admin username** (e.g. `am2050admin`) and password.
7. **Networking**:
   - Connectivity method: **Public access (allowed IP addresses)**.
   - Check **Allow public access from any Azure service within Azure to this server**.
8. Click **Review + create** -> **Create**.
9. Once created, go to the server -> **Databases** -> Click **+ Add** -> Name: `am2050_production`.

---

### Step 3.2: Create Linux Virtual Machine
1. In Azure Portal, search for **Virtual machines** -> click **Create** -> **Azure virtual machine**.
2. **Resource group**: Select `rg-am2050-prod`.
3. **Virtual machine name**: `vm-am2050-app`.
4. **Region**: Same as MySQL server (`West Europe`).
5. **Image**: **Ubuntu Server 24.04 LTS - x64 Gen2**.
6. **Size**: Click **See all sizes** -> filter by `B1s` -> select **Standard_B1s (1 vcpu, 1 GiB memory)**.
7. **Administrator account**:
   - Authentication type: **SSH public key**.
   - Username: `azureuser`.
   - Key pair name: generate new or use existing.
8. **Inbound port rules**:
   - Select: **SSH (22), HTTP (80), HTTPS (443)**.
9. **Networking Tab**:
   - Under **Public IP**, click **Create new** or **Configure**.
   - Set **DNS name label**: `am2050` (Result: `am2050.<region>.cloudapp.azure.com`).
10. Click **Review + create** -> **Create**. Download your private key (`.pem`).

---

## 4. Server Configuration & SSL Setup

SSH into your new Azure VM:
```bash
ssh -i /path/to/private-key.pem azureuser@am2050.<region>.cloudapp.azure.com
```

Run the automated setup script directly:
```bash
curl -fsSL https://raw.githubusercontent.com/Al-Ahotanee/AM2050-cloud/main/deployment/azure/setup-vm.sh -o setup-vm.sh
sudo bash setup-vm.sh am2050.<region>.cloudapp.azure.com your-email@example.com
```

The script will:
- Enable a 2 GB swapfile so the 1 GB VM runs smoothly.
- Install Docker, Docker Compose, Nginx, and Certbot.
- Acquire a Let's Encrypt SSL certificate.
- Clone `AM2050-cloud` to `/opt/am2050`.

Now create the production environment file:
```bash
sudo nano /opt/am2050/.env
```
Paste the following values:
```ini
APP_URL=https://am2050.<region>.cloudapp.azure.com
DB_HOST=<your-azure-mysql-server>.mysql.database.azure.com
DB_PORT=3306
DB_NAME=am2050_production
DB_USER=am2050admin
DB_PASS=YourSecurePassword!
JWT_SECRET=super_secret_production_key_am2050_jwt_random_string_32_chars
CLOUDINARY_CLOUD_NAME=dxnbuqcfy
CLOUDINARY_API_KEY=346594288951922
CLOUDINARY_API_SECRET=ZyOV7-jT3MW-ks_LyIlDjCRfK5E
CLOUDINARY_PRODUCT_ENV=dxnbuqcfy
TAGLINE=ZERO OUT FOR SCHOOL IN CHILDREN IN AREWA BY 2050
```

Start the application container:
```bash
cd /opt/am2050
sudo docker compose -f deployment/azure/docker-compose.azure.yml up -d --build
```

---

## 5. Migrate Data from Aiven to Azure MySQL

From your local machine (or the VM), run the streaming migration tool:
```bash
pip install pymysql cryptography

python deployment/azure/migrate-aiven-to-azure.py \
  --source-url="<AIVEN_MYSQL_URL>" \
  --dest-url="mysql://am2050admin:<PASSWORD>@<your-azure-mysql-server>.mysql.database.azure.com:3306/am2050_production"
```

The tool will:
- Stream all records with `SET FOREIGN_KEY_CHECKS=0`.
- Populate all tables, schools, households, children, attendance records, and admin credentials.
- Output an automated verification table confirming 100% row match.

---

## 6. GitHub Actions Automated CI/CD Setup

In your GitHub repository [Al-Ahotanee/AM2050-cloud](https://github.com/Al-Ahotanee/AM2050-cloud):
1. Go to **Settings** -> **Secrets and variables** -> **Actions** -> Click **New repository secret**.
2. Add the following secrets:
   - `AZURE_VM_HOST`: `am2050.<region>.cloudapp.azure.com`
   - `AZURE_VM_USERNAME`: `azureuser`
   - `AZURE_SSH_KEY`: The entire content of your private SSH key file (`-----BEGIN OPENSSH PRIVATE KEY----- ...`).
   - `AZURE_SSH_PORT`: `22` (optional, default is 22).

Every subsequent `git push origin main` will now automatically test, build, and deploy zero-downtime updates to your Azure VM!
