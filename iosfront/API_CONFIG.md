# API Configuration

The app is currently configured to use the production API at:
`https://golden-hind.duckdns.org`

If you need to change the API endpoint (for development or testing), update the file:
`src/utils/constants.js`

## Changing the API URL

1. Open `src/utils/constants.js`
2. Find the line: `export const API_BASE_URL = 'https://golden-hind.duckdns.org';`
3. Replace with your API URL
4. Restart the development server

## Local Development

If running the backend locally:

```javascript
export const API_BASE_URL = 'http://YOUR_LOCAL_IP:PORT';
```

**Note**: Don't use `localhost` or `127.0.0.1` when testing on physical devices. Use your computer's local IP address instead.

### Finding Your Local IP

**macOS/Linux**:
```bash
ifconfig | grep "inet "
```

**Windows**:
```bash
ipconfig
```

Look for your IPv4 address (usually starts with 192.168.x.x or 10.x.x.x)

## Security Note

Never commit API keys or sensitive credentials to the repository. Use environment variables for sensitive data.
