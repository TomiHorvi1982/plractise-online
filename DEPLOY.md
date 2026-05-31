# JamStream — Deployment Guide

## Option 1: Render.com (Free — Doporučeno)

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "init"
gh repo create jamstream --public --push
```

### 2. Web Service (Backend)
- **Dashboard** → New + Web Service → Connect repo
- **Name**: `jamstream-api`
- **Runtime**: Node
- **Build Command**: `cd client && npm install && npm run build && cd ../server && npm install`
- **Start Command**: `cd server && npm start`
- **Free Plan** (750h/month)
- Set env: `NODE_ENV=production`, `PORT=10000`, `DB_PATH=/var/data/jamstream.db`

### 3. Static Site (Frontend)
Frontend je servírován backendem v production režimu — **žádný separátní frontend**. Stačí jeden Web Service.

Po deploy: https://jamstream-api.onrender.com

---

## Option 2: Railway.app

### 1. Project → Deploy from GitHub
Railway detekuje `package.json` v rootu.

### 2. Nastavení
- **Root**: `/`
- **Build**: `cd client && npm install && npm run build && cd ../server && npm install`
- **Start**: `cd server && npm start`
- **Healthcheck path**: `/`
- Railway dává $5 credit/měsíc (zdarma na ~2-3 appky)

---

## Option 3: Fly.io

```bash
fly launch
# vyber jamstream
fly deploy
```

Potřebuješ `fly.toml` s internal port 3001. Fly má free 3 VMs (256MB RAM).

---

## Option 4: VPS (maximální výkon)

### Na VPS (Ubuntu 22.04):
```bash
# Nainstaluj Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs git

# Klonuj
git clone https://github.com/YOUR_USER/jamstream.git
cd jamstream

# Build
cd client && npm install && npm run build
cd ../server && npm install

# Spust (přes PM2 pro auto-restart)
sudo npm install -g pm2
pm2 start server/src/index.ts --interpreter npx --interpreter-args tsx --name jamstream
pm2 save
pm2 startup
```

### Reverse proxy (Nginx):
```nginx
server {
    listen 80;
    server_name jamstream.tvoje-domena.cz;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

---

## Lokální spuštění
```bash
# 1. Server (terminál 1)
cd server && npm run dev

# 2. Client (terminál 2)
cd client && npm run dev

# Otevři http://localhost:5173
```

Pro otestování s kámošem: oba se připojte na stejnou IP/URL.

---

## Firewall / Port forwarding

Pokud hostuješ doma:
1. Přesměruj port 3001 na svém routeru na IP počítače
2. Nebo použij https://ngrok.com:
   ```bash
   ngrok http 3001
   ```
3. Pošli kámošovi ngrok URL
