const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");

// Initialize environment variables
require("dotenv").config({ path: "./main.env" });

console.log("=== REPLIT SERVER STARTUP ===");
console.log("Current directory:", __dirname);
console.log("Public path:", path.join(__dirname, "public"));
console.log(
    "Files in public:",
    fs.readdirSync(path.join(__dirname, "public")).join(", "),
);

const app = express();

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        publicFiles: fs.readdirSync(path.join(__dirname, "public")),
    });
});

// Root route
app.get("/", (req, res) => {
    const indexPath = path.join(__dirname, "public", "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("index.html not found");
        console.error("ERROR: index.html not found in:", indexPath);
    }
});

// About route
app.get("/about", (req, res) => {
    const aboutPath = path.join(__dirname, "public", "about.html");
    if (fs.existsSync(aboutPath)) {
        res.sendFile(aboutPath);
    } else {
        res.status(404).send("about.html not found");
        console.error("ERROR: about.html not found in:", aboutPath);
    }
});

// GPT move endpoint
app.post("/api/gpt-move", async (req, res) => {
    try {
        const { fen, lastMove } = req.body;

        if (!fen) {
            return res.status(400).json({ error: "FEN position is required" });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a chess engine. Respond only with the best move in standard algebraic notation (e.g., 'e4', 'Nf6', 'O-O'). No other text.",
                },
                {
                    role: "user",
                    content: `Current position in FEN: ${fen}\nLast move: ${lastMove || "None"}\nProvide the best move for Black.`,
                },
            ],
            temperature: 0.3,
            max_tokens: 10,
        });

        const move = response.choices[0].message.content.trim();
        res.json({ move });
    } catch (error) {
        console.error("Error getting move from GPT:", error);
        res.status(500).json({
            error: "Failed to get move from GPT",
            details: error.message,
        });
    }
});

// Chat response endpoint
app.post("/api/chat-response", async (req, res) => {
    try {
        const { message, fen, lastMove } = req.body;

        if (!message || !fen) {
            return res
                .status(400)
                .json({ error: "Message and FEN position are required" });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a friendly chess assistant. Provide helpful, concise responses about the current game.",
                },
                {
                    role: "user",
                    content: `Current position in FEN: ${fen}\nLast move: ${lastMove || "None"}\nUser question: ${message}`,
                },
            ],
            temperature: 0.7,
            max_tokens: 150,
        });

        const reply = response.choices[0].message.content;
        res.json({ reply });
    } catch (error) {
        console.error("Error getting chat response:", error);
        res.status(500).json({
            error: "Failed to get chat response",
            details: error.message,
        });
    }
});

// 404 handler for undefined routes
app.use((req, res) => {
    console.log("404 Not Found:", req.url);
    res.status(404).json({
        error: "Not Found",
        requestedUrl: req.url,
        availableRoutes: [
            "/health",
            "/",
            "/about",
            "/api/gpt-move",
            "/api/chat-response",
        ],
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
});

// Start server with Replit-specific configuration
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log("Environment loaded from: main.env");
    console.log(
        `API Key length: ${process.env.OPENAI_API_KEY?.length || 0} characters`,
    );
    console.log("Available routes:");
    console.log("- GET /health (server status)");
    console.log("- GET / (main game)");
    console.log("- GET /about (about page)");
    console.log("- POST /api/gpt-move (chess moves)");
    console.log("- POST /api/chat-response (chat)");
});
