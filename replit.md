# QRIS REST API

## Overview
This is a Node.js REST API application for converting QRIS static payloads to dynamic ones and handling DANA webhooks. The project provides two main endpoints:
1. `/qris/dynamic` - Converts static QRIS codes to dynamic ones with embedded amounts
2. `/webhook/dana` - Webhook receiver for payment notifications

## Recent Changes (September 11, 2025)
- Successfully imported from GitHub and configured for Replit environment
- Fixed variable redeclaration errors in server.js
- Configured workflow to run on port 3000 (backend API)
- Tested all endpoints and verified functionality
- Set up deployment configuration for VM target

## Project Architecture
- **Language**: Node.js with Express framework
- **Port**: 3000 (backend API server)
- **Dependencies**: cors, dotenv, express, helmet, morgan, qrcode
- **Structure**:
  - `server.js` - Main application server
  - `src/qris.js` - QRIS TLV parsing and CRC calculation utilities
  - `src/utils.js` - Helper functions for amount parsing and IP validation

## Environment Configuration
The application requires several environment variables that should be configured using Replit Secrets (not a committed .env file):
- `QRIS_STATIC` - Static QRIS payload string (keep private)
- `UNIQUE_CODE` - Default unique code for amount calculation 
- `WEBHOOK_TOKEN` - Token for webhook authentication
- `ALLOWED_IPS` - Comma-separated list of allowed IP addresses
- `PORT` - Server port (defaults to 3000, can be overridden)

Note: Use Replit's Secrets tab to configure these environment variables securely rather than committing them to the repository.

## Deployment
- **Target**: VM deployment (stateful API requiring continuous operation)
- **Command**: `npm start`
- **Status**: Ready for production deployment

## Security Features
- IP allowlist for webhook endpoints
- Token-based authentication for webhooks
- Helmet middleware for security headers
- CORS support for cross-origin requests