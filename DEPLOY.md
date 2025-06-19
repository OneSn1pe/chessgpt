# Deploying Chess GPT to Vercel

## Prerequisites
- A Vercel account (sign up at https://vercel.com)
- Git repository with your code
- OpenAI API key

## Deployment Steps

### 1. Push to GitHub
First, ensure your code is pushed to a GitHub repository:
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 2. Import to Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel will auto-detect the configuration from `vercel.json`

### 3. Configure Environment Variables
In the Vercel dashboard, add your environment variable:
- **OPENAI_API_KEY**: Your OpenAI API key (without quotes)

### 4. Deploy
Click "Deploy" and Vercel will:
- Install dependencies
- Set up serverless functions from the `/api` directory
- Serve static files from the `/public` directory
- Configure routing based on `vercel.json`

## Project Structure for Vercel

```
chessgpt-1/
├── api/                    # Serverless functions
│   ├── gpt-move.js        # Chess move endpoint
│   ├── chat-response.js   # Chat endpoint
│   └── health.js          # Health check endpoint
├── public/                 # Static files
│   ├── index.html         # Main game
│   └── about.html         # About page
├── vercel.json            # Vercel configuration
├── package.json           # Dependencies
└── .env                   # Local environment (not deployed)
```

## Testing Locally

The original Express server can still be used for local development:
```bash
npm install
npm start
```

## Production URL

After deployment, your app will be available at:
- `https://your-project-name.vercel.app`

The API endpoints will be:
- `/api/gpt-move`
- `/api/chat-response`
- `/api/health`

## Important Notes

1. **API Key Security**: Never commit your `.env` file. Always use Vercel's environment variables for production.

2. **Rate Limiting**: The serverless functions include basic rate limiting (30 requests/minute per IP).

3. **Cold Starts**: Serverless functions may have cold starts. The first request after inactivity might be slower.

4. **Logs**: View function logs in the Vercel dashboard under the "Functions" tab.

## Troubleshooting

- **503 Errors**: Check that your OPENAI_API_KEY is correctly set in Vercel's environment variables
- **404 Errors**: Ensure the `vercel.json` routing configuration is correct
- **Build Errors**: Check the Vercel build logs for dependency issues