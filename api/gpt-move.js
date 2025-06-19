const OpenAI = require("openai");

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiting storage
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

// Rate limiting function
function checkRateLimit(ip) {
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, firstRequest: now });
        return true;
    }
    
    const userData = rateLimitMap.get(ip);
    
    if (now - userData.firstRequest > RATE_LIMIT_WINDOW) {
        // Reset window
        rateLimitMap.set(ip, { count: 1, firstRequest: now });
        return true;
    }
    
    if (userData.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }
    
    userData.count++;
    return true;
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check rate limit
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
            error: "Too many requests",
            message: "Please wait before making more requests"
        });
    }

    try {
        const { fen, lastMove } = req.body;

        if (!fen) {
            return res.status(400).json({ 
                error: "Bad Request",
                message: "FEN position is required" 
            });
        }

        console.log(`[GPT Move] Processing move request for position: ${fen}`);

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a chess engine. Respond only with the best move in standard algebraic notation (e.g., 'e4', 'Nf6', 'O-O'). No other text."
                },
                {
                    role: "user",
                    content: `Current position in FEN: ${fen}\nLast move: ${lastMove || "None"}\nProvide the best move for Black.`
                }
            ],
            temperature: 0.3,
            max_tokens: 10,
            n: 1,
            stop: ["\n"]
        });

        const move = response.choices[0].message.content.trim();
        console.log(`[GPT Move] Generated move: ${move}`);
        
        res.status(200).json({ move });
    } catch (error) {
        console.error("[GPT Move] Error:", error.message);
        
        if (error.code === 'insufficient_quota') {
            return res.status(503).json({
                error: "Service Unavailable",
                message: "OpenAI API quota exceeded. Please try again later."
            });
        }
        
        if (error.code === 'invalid_api_key') {
            return res.status(503).json({
                error: "Service Unavailable",
                message: "Invalid API key configuration."
            });
        }
        
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to generate move. Please try again."
        });
    }
};