# Smartproxy Residential Proxy Setup

## Sign Up & Configuration

### 1. Create Account
- Visit: https://smartproxy.com
- Sign up for account
- Choose **Residential Proxies** plan
- Recommended: **Pay-as-you-go** (3GB = ~$25/month)

### 2. Get Credentials
After signup, go to Dashboard → Residential Proxies:
- **Username:** Your Smartproxy username
- **Password:** Your Smartproxy password
- **Endpoint:** `gate.smartproxy.com:7000`

### 3. Add to .env
Update `/backend/.env`:
```bash
SMARTPROXY_ENABLED="true"
SMARTPROXY_USERNAME="your_username_here"
SMARTPROXY_PASSWORD="your_password_here"
SMARTPROXY_HOST="gate.smartproxy.com"
SMARTPROXY_PORT="7000"
```

### 4. Test Connection
```bash
curl -x http://your_username:your_password@gate.smartproxy.com:7000 https://ip.smartproxy.com/json
```

Should return your proxy IP address.

---

## Pricing

| Plan | Traffic | Cost | Best For |
|------|---------|------|----------|
| Starter | 3GB | ~$25 | MVP testing |
| Growth | 10GB | ~$75 | Light production |
| Business | 50GB | ~$300 | Full production |

**Recommendation for MVP:** Start with 3GB ($25/month)

---

## Integration

The agent will automatically use proxies when `SMARTPROXY_ENABLED="true"` in `.env`.

No code changes needed - proxies are configured in the agent automatically.

---

## Alternative: Skip Proxies Initially

Set `SMARTPROXY_ENABLED="false"` to test without proxies first.

The system will still work but may get blocked more frequently.
