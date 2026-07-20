// Authentication Service - JWT and password management
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import prisma from '../utils/database.js';
import cacheService from '../utils/redis.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../utils/errors.js';

class AuthService {
  _googleClientIdSet = new Set(
    (config.googleClientIds || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

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
      sub: user.id,
      userId: user.id,
      email: user.email,
      userType: user.userType,
      // Python coordination services use this claim for tenant-scoped RLS.
      // Until org membership is unified, a user account owns its own workspace.
      tenant_id: user.tenantId || user.id,
    };
  }

  _getRefreshTokenExpiryDate() {
    const fallbackDays = 30;
    const raw = String(config.refreshTokenExpiresIn || '').trim();
    const match = raw.match(/^(\d+)([smhd])$/i);

    if (!match) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + fallbackDays);
      return expiresAt;
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multiplierByUnit = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + amount * multiplierByUnit[unit]);
  }

  _generateRefreshToken(user, fastify) {
    return fastify.jwt.sign(
      {
        ...this._generateTokenPayload(user),
        jti: crypto.randomUUID(),
        tokenType: 'refresh',
      },
      {
        secret: config.refreshTokenSecret,
        expiresIn: config.refreshTokenExpiresIn,
      }
    );
  }

  async _issueSessionTokens(user, fastify) {
    const tokenPayload = this._generateTokenPayload(user);
    const accessToken = fastify.jwt.sign(tokenPayload, {
      expiresIn: config.jwtExpiresIn,
    });
    const refreshToken = this._generateRefreshToken(user, fastify);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: this._getRefreshTokenExpiryDate(),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async _verifyGoogleIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      throw new AuthenticationError('Google ID token is required');
    }

    if (!this._googleClientIdSet.size) {
      throw new AuthenticationError(
        'Google sign-in is not configured. Set GOOGLE_CLIENT_IDS first.'
      );
    }

    const url = new URL(config.googleTokenInfoUrl);
    url.searchParams.set('id_token', idToken);

    let response;
    try {
      response = await fetch(url.toString(), { method: 'GET' });
    } catch (_error) {
      throw new AuthenticationError('Google token verification is currently unavailable');
    }

    if (!response.ok) {
      throw new AuthenticationError('Google ID token is invalid or expired');
    }

    const tokenInfo = await response.json();

    if (!tokenInfo?.email || tokenInfo.email_verified !== 'true') {
      throw new AuthenticationError('Google account email is not verified');
    }

    if (!tokenInfo.aud || !this._googleClientIdSet.has(tokenInfo.aud)) {
      throw new AuthenticationError('Google token audience does not match this app');
    }

    return {
      email: String(tokenInfo.email).trim().toLowerCase(),
      fullName: typeof tokenInfo.name === 'string' ? tokenInfo.name.trim() : null,
      googleSubject: tokenInfo.sub,
    };
  }

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Created user
   */
  async register(userData) {
    const { password, fullName, userType } = userData;
    const email = String(userData.email || '').trim().toLowerCase();

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

  async registerAndIssueTokens(userData, fastify) {
    const user = await this.register(userData);
    const { accessToken, refreshToken } = await this._issueSessionTokens(user, fastify);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
        details: {
          reason: 'post_register',
        },
      },
    });

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} User and tokens
   */
  async login(credentials, fastify) {
    const password = credentials.password;
    const email = String(credentials.email || '').trim().toLowerCase();

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

    const { accessToken, refreshToken } = await this._issueSessionTokens(
      user,
      fastify
    );

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

  async loginWithGoogle(googlePayload, fastify) {
    const { idToken, userType = 'donor' } = googlePayload;
    const googleProfile = await this._verifyGoogleIdToken(idToken);

    const normalizedUserType = ['donor', 'volunteer'].includes(userType)
      ? userType
      : 'donor';

    let user = await prisma.user.findUnique({
      where: { email: googleProfile.email },
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
      const generatedPassword = crypto.randomBytes(24).toString('hex');
      const passwordHash = await this._hashPassword(generatedPassword);

      user = await prisma.user.create({
        data: {
          email: googleProfile.email,
          passwordHash,
          fullName: googleProfile.fullName || googleProfile.email.split('@')[0],
          userType: normalizedUserType,
          isVerified: true,
        },
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
    } else if (!user.fullName && googleProfile.fullName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { fullName: googleProfile.fullName },
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
    }

    const { accessToken, refreshToken } = await this._issueSessionTokens(
      user,
      fastify
    );

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_GOOGLE',
        entityType: 'user',
        entityId: user.id,
        details: {
          provider: 'google',
          sub: googleProfile.googleSubject,
        },
      },
    });

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
    const nextRefreshToken = this._generateRefreshToken(user, fastify);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: nextRefreshToken,
          expiresAt: this._getRefreshTokenExpiryDate(),
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken: nextRefreshToken,
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
