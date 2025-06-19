const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");

// Initialize environment variables from .env file
require("dotenv").config();

// Validate environment variables
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.error("ERROR: OPENAI_API_KEY is not set in .env file");
    console.error("Please add your OpenAI API key to the .env file");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, "public")));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - ${req.ip}`);
    next();
});

// Rate limiting storage (simple in-memory for now)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

// Rate limiting middleware for API endpoints
const rateLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, firstRequest: now });
        return next();
    }
    
    const userData = rateLimitMap.get(ip);
    
    if (now - userData.firstRequest > RATE_LIMIT_WINDOW) {
        // Reset window
        rateLimitMap.set(ip, { count: 1, firstRequest: now });
        return next();
    }
    
    if (userData.count >= RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({
            error: "Too many requests",
            message: "Please wait before making more requests"
        });
    }
    
    userData.count++;
    next();
};

// Clean up rate limit map periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitMap.entries()) {
        if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
            rateLimitMap.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW);

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "production",
        apiKeyConfigured: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'
    });
});

// GPT move endpoint with rate limiting
app.post("/api/gpt-move", rateLimiter, async (req, res) => {
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
        
        res.json({ move });
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
});

// Chat response endpoint with rate limiting
app.post("/api/chat-response", rateLimiter, async (req, res) => {
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
        
        res.json({ reply });
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
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        error: "Not Found",
        message: `Route ${req.url} not found`,
        availableEndpoints: {
            health: "GET /health",
            game: "GET /",
            about: "GET /about",
            api: {
                move: "POST /api/gpt-move",
                chat: "POST /api/chat-response"
            }
        }
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error("[Server Error]", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: process.env.NODE_ENV === "development" ? err.message : "An error occurred processing your request"
    });
});

// Start server
app.listen(PORT, () => {
    console.log("\n=== Chess GPT-4 Server Started ===");
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "production"}`);
    console.log(`CORS origin: ${process.env.CORS_ORIGIN || "*"}`);
    console.log(`API Key configured: ${process.env.OPENAI_API_KEY ? "Yes" : "No"}`);
    console.log("\nAvailable endpoints:");
    console.log("- GET  /health         (Health check)");
    console.log("- GET  /               (Chess game)");
    console.log("- GET  /about          (About page)");
    console.log("- POST /api/gpt-move   (Get AI move)");
    console.log("- POST /api/chat-response (Chat with AI)");
    console.log("\nRate limit: 30 requests per minute per IP");
    console.log("=============================\n");
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nGracefully shutting down...');
    process.exit(0);
});