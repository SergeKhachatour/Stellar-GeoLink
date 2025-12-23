const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateUser = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔐 authenticateUser - token received:', token ? 'YES' : 'NO');
    console.log('🔐 authenticateUser - JWT_SECRET exists:', !!process.env.JWT_SECRET);

    // If no token, user is not authenticated but we'll let the route handler decide what to do
    if (!token) {
        console.log('🔐 authenticateUser - no token, setting user to null');
        req.user = null;
        return next();
    }

    try {
        console.log('🔐 authenticateUser - verifying token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('🔐 authenticateUser - token decoded successfully:', !!decoded);
        console.log('🔐 authenticateUser - decoded payload:', JSON.stringify(decoded, null, 2));
        
        // Handle both old token format (userId, role) and new format (user: { id, email, role })
        let userId = null;
        if (decoded.user && decoded.user.id) {
            // New format: { user: { id, email, role } }
            userId = decoded.user.id;
        } else if (decoded.userId) {
            // Old format: { userId, role, status }
            userId = decoded.userId;
        }
        
        if (userId) {
            // Fetch user's public key and role from database
            const result = await pool.query(
                'SELECT id, email, role, public_key FROM users WHERE id = $1',
                [userId]
            );
            
            if (result.rows.length > 0) {
                const dbUser = result.rows[0];
                req.user = {
                    id: dbUser.id,
                    email: dbUser.email,
                    role: dbUser.role,
                    public_key: dbUser.public_key
                };
                console.log('🔐 authenticateUser - user set:', { id: req.user.id, role: req.user.role });
            } else {
                console.warn('🔐 authenticateUser - user not found in database for userId:', userId);
                req.user = null;
            }
        } else {
            console.warn('🔐 authenticateUser - no userId found in token payload');
            req.user = null;
        }
        
        next();
    } catch (err) {
        // Invalid token, but we'll let the route handler decide what to do
        console.log('🔐 authenticateUser - token verification failed:', err.message);
        req.user = null;
        next();
    }
};

const authenticateAdmin = async (req, res, next) => {
    try {
        // First run the normal user authentication
        await authenticateUser(req, res, async () => {
            // Then check if the user is an admin
            if (req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Access denied. Admin rights required.' });
            }
            next();
        });
    } catch (error) {
        res.status(401).json({ message: 'Authentication failed' });
    }
};

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    next();
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
};

module.exports = { 
    authenticateUser, 
    authenticateAdmin,
    requireAuth,
    requireRole 
}; 