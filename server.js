const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const port = 3000;

// Data file paths
const dataFilePath = path.join(__dirname, "data.json");
const usersFilePath = path.join(__dirname, "users.json");

// Initialize data files if they don't exist
if (!fs.existsSync(dataFilePath)) {
    const initialData = {
        queue: [],
        dailyTokens: {} // Store token counters for each date
    };
    fs.writeFileSync(dataFilePath, JSON.stringify(initialData, null, 2));
}

if (!fs.existsSync(usersFilePath)) {
    // Create a default admin user with hashed password
    const hashedPassword = bcrypt.hashSync("admin123", 10);
    const initialUsers = [
        {
            id: 1,
            username: "admin",
            password: hashedPassword,
            name: "System Administrator",
            role: "admin",
            createdAt: new Date().toISOString()
        }
    ];
    fs.writeFileSync(usersFilePath, JSON.stringify(initialUsers, null, 2));
}

// Helper function to read data
function readData() {
    try {
        const data = fs.readFileSync(dataFilePath);
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data:", error);
        return { queue: [], dailyTokens: {} };
    }
}

// Helper function to write data
function writeData(data) {
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing data:", error);
    }
}

// Helper function to read users
function readUsers() {
    try {
        const users = fs.readFileSync(usersFilePath);
        return JSON.parse(users);
    } catch (error) {
        console.error("Error reading users:", error);
        return [];
    }
}

// Helper function to write users
function writeUsers(users) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error("Error writing users:", error);
    }
}

// Get or create token counter for a specific date
function getTokenCounterForDate(dateString) {
    const data = readData();
    
    if (!data.dailyTokens) {
        data.dailyTokens = {};
    }
    
    if (!data.dailyTokens[dateString]) {
        data.dailyTokens[dateString] = 1;
        writeData(data);
    }
    
    return data.dailyTokens[dateString];
}

// Increment token counter for a specific date
function incrementTokenCounterForDate(dateString) {
    const data = readData();
    
    if (!data.dailyTokens) {
        data.dailyTokens = {};
    }
    
    if (!data.dailyTokens[dateString]) {
        data.dailyTokens[dateString] = 1;
    } else {
        data.dailyTokens[dateString]++;
    }
    
    writeData(data);
    return data.dailyTokens[dateString];
}

// Simple in-memory session store
const sessions = new Map();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Enhanced cookie parser middleware
app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie;
    req.cookies = {};
    
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.trim().split('=');
            if (parts.length === 2) {
                req.cookies[parts[0]] = decodeURIComponent(parts[1]);
            }
        });
    }
    
    next();
});

// Generate simple session token
function generateSessionToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Middleware to check admin authentication for API routes
function requireAuth(req, res, next) {
    const sessionToken = req.headers['x-session-token'] || 
                         req.cookies?.sessionToken;
    
    console.log('API Auth check - Session token:', sessionToken);
    console.log('Active sessions:', Array.from(sessions.keys()));
    
    if (sessionToken && sessions.has(sessionToken)) {
        req.adminSession = sessions.get(sessionToken);
        console.log('API authentication successful for user:', req.adminSession.username);
        next();
    } else {
        console.log('API Authentication failed');
        res.status(401).json({ error: "Authentication required" });
    }
}

// Middleware to check admin authentication for pages
function requireAuthPage(req, res, next) {
    const sessionToken = req.cookies?.sessionToken;
    
    console.log('Page Auth check - Session token:', sessionToken);
    console.log('Active sessions:', Array.from(sessions.keys()));
    
    if (sessionToken && sessions.has(sessionToken)) {
        console.log('Page authentication successful');
        req.adminSession = sessions.get(sessionToken);
        next();
    } else {
        console.log('Page authentication failed, redirecting to login');
        // Clear any invalid session cookie
        res.setHeader('Set-Cookie', 'sessionToken=; HttpOnly; Path=/; Max-Age=0');
        res.redirect('/login');
    }
}

// Serve the front-end pages
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "queue-management-system.html"));
});

app.get("/login", (req, res) => {
    // Check if already authenticated
    const sessionToken = req.cookies?.sessionToken;
    if (sessionToken && sessions.has(sessionToken)) {
        console.log('Already authenticated, redirecting to admin');
        return res.redirect('/admin');
    }
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/admin", requireAuthPage, (req, res) => {
    console.log('Serving admin panel to user:', req.adminSession.username);
    res.sendFile(path.join(__dirname, "admin-panel.html"));
});

// Admin login endpoint
app.post("/api/admin-login", (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Login attempt for user:', username);
        
        // Get users from database
        const users = readUsers();
        const user = users.find(u => u.username === username);
        
        if (user && bcrypt.compareSync(password, user.password)) {
            // Generate session token
            const sessionToken = generateSessionToken();
            const sessionData = {
                userId: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                loginTime: new Date().toISOString()
            };
            
            // Store session
            sessions.set(sessionToken, sessionData);
            
            // Set cookie with proper attributes
            res.setHeader('Set-Cookie', `sessionToken=${sessionToken}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);
            
            console.log('Login successful for user:', username);
            console.log('New session created:', sessionToken);
            
            res.json({ 
                success: true, 
                message: "Login successful",
                sessionToken,
                username: user.username,
                name: user.name,
                redirect: "/admin"
            });
        } else {
            console.log('Login failed: Invalid credentials for user:', username);
            res.status(401).json({ 
                success: false, 
                message: "Invalid username or password" 
            });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error during login" 
        });
    }
});

// Admin registration endpoint (protected)
app.post("/api/admin-register", requireAuth, (req, res) => {
    try {
        const { username, password, name } = req.body;
        
        // Basic validation
        if (!username || !password || !name) {
            return res.status(400).json({ error: "All fields are required" });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }
        
        // Get users from database
        const users = readUsers();
        
        // Check if username already exists
        if (users.some(u => u.username === username)) {
            return res.status(400).json({ error: "Username already exists" });
        }
        
        // Hash password
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        // Create new user
        const newUser = {
            id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            password: hashedPassword,
            name,
            role: "admin",
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        writeUsers(users);
        
        console.log('New admin user created by', req.adminSession.username + ':', username);
        
        res.json({ 
            success: true, 
            message: "Admin user created successfully",
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error during registration" 
        });
    }
});

// Get current user info
app.get("/api/user-info", requireAuth, (req, res) => {
    try {
        const users = readUsers();
        const user = users.find(u => u.id === req.adminSession.userId);
        
        if (user) {
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    createdAt: user.createdAt
                }
            });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (error) {
        console.error("Error getting user info:", error);
        res.status(500).json({ error: "Failed to get user info" });
    }
});

// Get all users (admin only)
app.get("/api/users", requireAuth, (req, res) => {
    try {
        if (req.adminSession.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
        }
        
        const users = readUsers();
        
        // Return users without passwords
        const usersWithoutPasswords = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        
        res.json({
            success: true,
            users: usersWithoutPasswords
        });
    } catch (error) {
        console.error("Error getting users:", error);
        res.status(500).json({ error: "Failed to get users" });
    }
});

// Admin logout endpoint
app.post("/api/admin-logout", (req, res) => {
    try {
        const sessionToken = req.cookies?.sessionToken || req.headers['x-session-token'];
        
        if (sessionToken) {
            sessions.delete(sessionToken);
            console.log('Session deleted:', sessionToken);
        }
        
        // Clear cookie
        res.setHeader('Set-Cookie', 'sessionToken=; HttpOnly; Path=/; Max-Age=0');
        
        res.json({ success: true, message: "Logout successful" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ success: false, message: "Server error during logout" });
    }
});

// Check auth status endpoint
app.get("/api/auth-status", (req, res) => {
    const sessionToken = req.cookies?.sessionToken || req.headers['x-session-token'];
    
    if (sessionToken && sessions.has(sessionToken)) {
        const sessionData = sessions.get(sessionToken);
        res.json({ 
            isAuthenticated: true,
            username: sessionData.username,
            name: sessionData.name
        });
    } else {
        res.json({ 
            isAuthenticated: false,
            username: null,
            name: null
        });
    }
});

// Add appointment (public route)
app.post("/api/add-appointment", (req, res) => {
    try {
        const { patientName, mobileNumber, doctorId, appointmentDate } = req.body;
        
        // Basic validation
        if (!patientName || !mobileNumber || !doctorId || !appointmentDate) {
            return res.status(400).json({ error: "All fields are required" });
        }
        
        const data = readData();
        
        // Get the date string in YYYY-MM-DD format
        const dateObj = new Date(appointmentDate);
        const dateString = dateObj.toISOString().split('T')[0];
        
        // Get the current token number for this date
        let tokenNumber = getTokenCounterForDate(dateString);
        
        // Generate token
        const token = "A-" + String(tokenNumber).padStart(3, '0');
        
        const patient = {
            token,
            patientName: patientName.trim(),
            mobileNumber: mobileNumber.trim(),
            doctorId,
            appointmentDate,
            status: "Waiting",
            createdAt: new Date().toISOString()
        };
        
        data.queue.push(patient);
        writeData(data);
        
        // Increment the token counter for this date
        incrementTokenCounterForDate(dateString);
        
        console.log('Appointment added:', patient);
        
        res.json({ 
            success: true,
            patient,
            message: "Appointment booked successfully"
        });
    } catch (error) {
        console.error("Error adding appointment:", error);
        res.status(500).json({ error: "Failed to add appointment" });
    }
});

// Get queue for admin (protected route)
app.get("/api/queue", requireAuth, (req, res) => {
    try {
        const data = readData();
        
        console.log('Queue requested by user:', req.adminSession.username);
        
        res.json({ 
            success: true, 
            queue: data.queue,
            totalCount: data.queue.length,
            waitingCount: data.queue.filter(p => p.status === 'Waiting').length,
            completedCount: data.queue.filter(p => p.status === 'Completed').length
        });
    } catch (error) {
        console.error("Error getting queue:", error);
        res.status(500).json({ error: "Failed to get queue" });
    }
});

// Mark patient as completed (protected route)
app.post("/api/complete", requireAuth, (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: "Token is required" });
        }
        
        const data = readData();
        const patient = data.queue.find(p => p.token === token);
        
        if (patient) {
            patient.status = "Completed";
            patient.completedAt = new Date().toISOString();
            writeData(data);
            
            console.log('Patient completed by user:', req.adminSession.username);
            
            res.json({ 
                success: true, 
                message: "Patient marked as completed",
                patient
            });
        } else {
            res.status(404).json({ error: "Patient not found" });
        }
    } catch (error) {
        console.error("Error completing appointment:", error);
        res.status(500).json({ error: "Failed to complete appointment" });
    }
});

// Remove patient from queue (protected route)
app.post("/api/remove", requireAuth, (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: "Token is required" });
        }
        
        const data = readData();
        const index = data.queue.findIndex(p => p.token === token);
        
        if (index !== -1) {
            const removedPatient = data.queue.splice(index, 1)[0];
            writeData(data);
            
            console.log('Patient removed by user:', req.adminSession.username);
            
            res.json({ 
                success: true, 
                message: "Patient removed from queue",
                removedPatient
            });
        } else {
            res.status(404).json({ error: "Patient not found" });
        }
    } catch (error) {
        console.error("Error removing appointment:", error);
        res.status(500).json({ error: "Failed to remove appointment" });
    }
});

// Handle 404 errors
app.use((req, res) => {
    console.log('404 - Route not found:', req.url);
    res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error("Global error:", error);
    res.status(500).json({ error: "Internal server error" });
});

// Clean up old sessions periodically (every hour)
setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [token, session] of sessions) {
        if (new Date(session.loginTime) < oneHourAgo) {
            sessions.delete(token);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} old sessions`);
    }
}, 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server gracefully...');
    process.exit(0);
});

app.listen(port, () => {
    console.log(`✅ MediQueue Server running at http://localhost:${port}`);
    console.log(`📋 Queue Management: http://localhost:${port}`);
    console.log(`🔐 Admin Login: http://localhost:${port}/login`);
    console.log(`⚙️  Admin Panel: http://localhost:${port}/admin`);
});