# NoviceReader Docker Deployment

This deployment runs the whole app on one VPS:

- Caddy receives public HTTP/HTTPS traffic.
- Next.js runs privately on port `3000`.
- FastAPI runs privately on port `8000`.
- Uploaded PDFs and JSON metadata persist under `backend/storage` and `backend/db`.

## Server Setup

Open these Lightsail firewall ports:

```txt
22
80
443
```

Install Docker and clone the repo, then enter the project:

```bash
cd ~/novicereader
```

Set production mode in `deployment.json`:

```json
{
  "isBuiltDeployment": true,
  "productionDomain": "novicereader.com",
  "productionOrigin": "https://novicereader.com",
  "productionWwwOrigin": "https://www.novicereader.com",
  "localFrontendOrigin": "http://localhost:3000",
  "localBackendPort": 8000
}
```

Create the backend env file on the server:

```bash
cp backend/.env.example backend/.env
nano backend/.env
chmod 600 backend/.env
```

For production, use values like:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
AUTH_SECRET_KEY=replace_with_output_of_openssl_rand_hex_32
ACCESS_TOKEN_EXPIRE_MINUTES=10080
REGISTRATION_CODE=your_private_registration_code
PUBLIC_BACKEND_ORIGIN=https://novicereader.com
FRONTEND_ORIGIN=https://novicereader.com
FRONTEND_ORIGINS=https://novicereader.com,https://www.novicereader.com
```

Generate `AUTH_SECRET_KEY` with:

```bash
openssl rand -hex 32
```

Create persistent data directories:

```bash
mkdir -p backend/storage backend/db
```

Start the app:

```bash
docker compose up -d --build
```

Check logs:

```bash
docker compose logs -f
```

Update after pulling new code:

```bash
git pull
docker compose up -d --build
```

Stop the app:

```bash
docker compose down
```
