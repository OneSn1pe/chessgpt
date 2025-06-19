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
        const { message, fen, lastMove } = req.body;

        if (!message || !fen) {
            return res.status(400).json({ 
                error: "Bad Request",
                message: "Message and FEN position are required" 
            });
        }

        // Sanitize message to prevent injection
        const sanitizedMessage = message.substring(0, 500);

        console.log(`[Chat] Processing chat message: "${sanitizedMessage}"`);

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a friendly chess assistant. Provide helpful, concise responses about the current game. Keep responses under 150 words."
                },
                {
                    role: "user",
                    content: `Current position in FEN: ${fen}\nLast move: ${lastMove || "None"}\nUser question: ${sanitizedMessage}`
                }
            ],
            temperature: 0.7,
            max_tokens: 150,
            n: 1
        });

        const reply = response.choices[0].message.content;
        console.log(`[Chat] Generated response length: ${reply.length} chars`);
        
        res.status(200).json({ reply });
    } catch (error) {
        console.error("[Chat] Error:", error.message);
        
        if (error.code === 'insufficient_quota') {
            return res.status(503).json({
                error: "Service Unavailable",
                message: "OpenAI API quota exceeded. Please try again later."
            });
        }
        
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to generate response. Please try again."
        });
    }
};