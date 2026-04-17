// Authentication Service - JWT and password management
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import prisma from '../utils/database.js';
import cacheService from '../utils/redis.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../utils/errors.js';

class AuthService {
  /**
   * Hash password
   * @private
   */
  async _hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verify password
   * @private
   */
  async _verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token payload
   * @private
   */
  _generateTokenPayload(user) {
    return {
      userId: user.id,
      email: user.email,
      userType: user.userType,
    };
  }

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Created user
   */
  async register(userData) {
    const { email, password, fullName, userType } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await this._hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        userType,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        userType: true,
        visibilityPreference: true,
        createdAt: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        entityType: 'user',
        entityId: user.id,
      },
    });

    return user;
  }

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} User and tokens
   */
  async login(credentials, fastify) {
    const { email, password } = credentials;

    // Find user with password hash
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        userType: true,
        visibilityPreference: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await this._verifyPassword(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate tokens
    const tokenPayload = this._generateTokenPayload(user);

    const accessToken = fastify.jwt.sign(tokenPayload, {
      expiresIn: config.jwtExpiresIn,
    });

    const refreshToken = fastify.jwt.sign(tokenPayload, {
      secret: config.refreshTokenSecret,
      expiresIn: config.refreshTokenExpiresIn,
    });

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
      },
    });

    // Remove password hash from response
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshAccessToken(refreshToken, fastify) {
    // Verify refresh token
    let decoded;
    try {
      decoded = fastify.jwt.verify(refreshToken, {
        secret: config.refreshTokenSecret,
      });
    } catch (error) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check if refresh token exists and is not revoked
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: decoded.userId,
        isRevoked: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!storedToken) {
      throw new AuthenticationError('Refresh token expired or revoked');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        userType: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Generate new access token
    const tokenPayload = this._generateTokenPayload(user);
    const accessToken = fastify.jwt.sign(tokenPayload, {
      expiresIn: config.jwtExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Logout user (revoke refresh token)
   * @param {string} refreshToken - Refresh token to revoke
   */
  async logout(refreshToken) {
    await prisma.refreshToken.updateMany({
      where: {
        token: refreshToken,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
      },
    });

    return { success: true };
  }

  /**
   * Verify access token and get user
   * @param {string} token - Access token
   * @returns {Promise<Object>} User data
   */
  async verifyToken(token, fastify) {
    try {
      const decoded = fastify.jwt.verify(token);

      // Check cache first
      const cacheKey = `user:${decoded.userId}`;
      let user = await cacheService.get(cacheKey);

      if (!user) {
        // Fetch from database
        user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            fullName: true,
            userType: true,
            visibilityPreference: true,
          },
        });

        if (user) {
          // Cache for 5 minutes
          await cacheService.set(cacheKey, user, 300);
        }
      }

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      return user;
    } catch (error) {
      throw new AuthenticationError('Invalid token');
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isValid = await this._verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await this._hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    return { success: true };
  }
}

export default new AuthService();
