const credentialsRequest = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password", minLength: 8 },
          name: { type: "string" }
        }
      }
    }
  }
} as const;

const refreshTokenRequest = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } }
      }
    }
  }
} as const;

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "rusticone-catering-api",
    version: "0.0.1",
    description: "API documentation for the Rusticone catering backend"
  },
  paths: {
    "/api/auth/register": {
      post: {
        summary: "Register a local user",
        tags: ["authentication"],
        requestBody: credentialsRequest,
        responses: {
          201: { description: "User registered and authenticated" },
          400: { description: "Invalid credentials" },
          409: { description: "Email already registered" }
        }
      }
    },
    "/api/auth/login": {
      post: {
        summary: "Log in with local credentials",
        tags: ["authentication"],
        requestBody: credentialsRequest,
        responses: {
          200: { description: "User authenticated" },
          401: { description: "Invalid credentials" }
        }
      }
    },
    "/api/auth/refresh": {
      post: {
        summary: "Generate a new access token",
        tags: ["authentication"],
        requestBody: refreshTokenRequest,
        responses: {
          200: { description: "Access token generated" },
          401: { description: "Invalid or expired refresh token" }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        summary: "Log out a session",
        tags: ["authentication"],
        requestBody: refreshTokenRequest,
        responses: { 204: { description: "Session removed" } }
      }
    },
    "/api/auth/me": {
      get: {
        summary: "Get the authenticated user profile",
        tags: ["authentication"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Authenticated user profile" },
          401: { description: "Missing or invalid access token" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  }
} as const;
