const jwt = require('jsonwebtoken');

// **Generate token**
exports.generateToken = (payload, expiresIn = '1d') => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// **Store token**
exports.storeToken = (res, token, tokenName, maxAge = 24 * 60 * 60 * 1000) => { // default maxAge: 1 day    
    res.cookie(tokenName, token, {
        httpOnly: true,       // Prevents client-side JS from accessing the cookie
        secure: true, // Ensures cookie is sent over HTTPS in production
        sameSite: 'Strict',   // Controls when cookies are sent (Strict is the most secure)
        maxAge,               // Expiration of the cookie in milliseconds
    });
};
