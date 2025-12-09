import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_prod';

export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
            res.status(403).json({ error: 'Invalid or expired token' });
            return;
        }
        req.user = user;
        next();
    });
};

export const optionalAuthenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        next();
        return;
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (!err) {
            req.user = user;
        }
        // If error, just proceed as guest (user remains undefined)
        next();
    });
};
