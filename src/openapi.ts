/*
  Single merged OpenAPI document for rusticone-catering-api.
  Exports `openApiDocument` as a const object.
*/

const registerRequest = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 1, pattern: "\\S" }
        }
      }
    }
  }
} as const;

const loginRequest = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 1 }
        }
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
    "/api/auth/google": {
      post: {
        summary: "Authenticate a user with Google",
        description:
          "Verifies a Google ID token, creates the user if needed, opens an independent session, returns an access token, and sets the refresh token as an HttpOnly cookie.",
        tags: ["auth"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["idToken"],
                properties: {
                  idToken: {
                    type: "string",
                    description: "Google ID token obtained on the client"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Existing user authenticated successfully",
            headers: { "Set-Cookie": { $ref: "#/components/headers/RefreshCookie" } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/GoogleAuthResponse" } } }
          },
          201: {
            description: "New user created and authenticated successfully",
            headers: { "Set-Cookie": { $ref: "#/components/headers/RefreshCookie" } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/GoogleAuthResponse" } } }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/users": {
      post: {
        summary: "Create a user",
        tags: ["users"],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UserInput" } } } },
        responses: { 201: { description: "User created successfully" }, 500: { description: "Unable to create the user" } }
      },
      get: {
        summary: "List users",
        tags: ["users"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "email", in: "query", schema: { type: "string" } }
        ],
        responses: { 200: { description: "Paginated user list" }, 500: { description: "Unable to list users" } }
      }
    },
    "/api/users/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        summary: "Get a user",
        tags: ["users"],
        responses: { 200: { description: "User found" }, 404: { description: "User not found" }, 500: { description: "Unable to get the user" } }
      },
      patch: {
        summary: "Update a user",
        tags: ["users"],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UserUpdate" } } } },
        responses: { 200: { description: "User updated successfully" }, 404: { description: "User not found" }, 500: { description: "Unable to update the user" } }
      },
      delete: {
        summary: "Delete a user",
        tags: ["users"],
        responses: { 204: { description: "User deleted successfully" }, 404: { description: "User not found" }, 500: { description: "Unable to delete the user" } }
      }
    },
    "/api/auth/register": {
      post: {
        summary: "Register a local user",
        tags: ["authentication"],
        requestBody: registerRequest,
        responses: {
          201: {
            description: "User registered and authenticated",
            headers: { "Set-Cookie": { $ref: "#/components/headers/RefreshCookie" } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/auth/login": {
      post: {
        summary: "Log in with local credentials",
        tags: ["authentication"],
        requestBody: loginRequest,
        responses: {
          200: {
            description: "User authenticated",
            headers: { "Set-Cookie": { $ref: "#/components/headers/RefreshCookie" } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/auth/refresh": {
      post: {
        summary: "Generate a new access token",
        description:
          "Rotates the refresh token from the HttpOnly cookie. In production the browser must use credentialed CORS from an exact FRONTEND_ORIGINS entry over HTTPS; SameSite=None cookies and the strict Origin check provide the cross-site CSRF assumptions.",
        tags: ["authentication"],
        security: [{ refreshCookie: [] }],
        responses: {
          200: {
            description: "Access token generated and refresh cookie replaced",
            headers: { "Set-Cookie": { $ref: "#/components/headers/RefreshCookie" } },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["accessToken"],
                  properties: { accessToken: { type: "string" } }
                }
              }
            }
          },
          401: {
            description: "Refresh credential is missing, malformed, expired, unknown, reused, or belongs to a revoked session family; the cookie is cleared",
            headers: { "Set-Cookie": { $ref: "#/components/headers/ClearedRefreshCookie" } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        summary: "Log out a session",
        description:
          "Idempotently revokes the session identified by the refresh cookie and clears that cookie. In production an exact trusted Origin is required.",
        tags: ["authentication"],
        security: [{ refreshCookie: [] }, {}],
        responses: {
          204: {
            description: "Session revoked when identifiable; cookie cleared even when absent or malformed",
            headers: { "Set-Cookie": { $ref: "#/components/headers/ClearedRefreshCookie" } }
          },
          403: { $ref: "#/components/responses/Forbidden" },
          500: {
            description: "Revocation infrastructure failed; the browser cookie is still cleared",
            headers: { "Set-Cookie": { $ref: "#/components/headers/ClearedRefreshCookie" } },
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/auth/me": {
      get: {
        summary: "Get the authenticated user profile",
        tags: ["authentication"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Authenticated user profile",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UserResponse" } } }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: {
            description: "Authenticated user no longer exists",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/uploads/temp": {
      post: {
        summary: "Pre-upload product images",
        description:
          "Streams one or more image files to Cloudinary, caches the resulting secure URLs in Redis under a short-lived upload session (1 hour TTL), and returns the session id to reference when creating a product. Admin only.",
        tags: ["uploads"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["images"],
                properties: {
                  images: {
                    type: "array",
                    maxItems: 5,
                    items: { type: "string", format: "binary" },
                    description: "Up to 5 image files, 5 MB each"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Images pre-uploaded successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UploadTempResponse" }
              }
            }
          },
          400: { description: "No image files provided or a non-image file was sent" },
          401: { description: "Access token is missing, invalid, or its session was revoked" },
          403: { description: "The authenticated user is not an admin" },
          503: { description: "Image upload storage (Redis) is unavailable" }
        }
      }
    },
    "/api/products": {
      post: {
        summary: "Create a product",
        description:
          "Creates a catering product. Optionally accepts an uploadSessionId returned by POST /api/uploads/temp to attach pre-uploaded images; the session is consumed and removed after a successful create. Admin only.",
        tags: ["products"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } }
          }
        },
        responses: {
          201: { description: "Product created successfully" },
          400: { description: "Invalid payload or an invalid/expired uploadSessionId" },
          401: { description: "Access token is missing, invalid, or its session was revoked" },
          403: { description: "The authenticated user is not an admin" },
          503: { description: "Image upload storage (Redis) is unavailable" }
        }
      }
    },
    "/api/quotes": {
      post: {
        summary: "Create a quote",
        description:
          "Creates a catering quote. Product prices are always snapshotted server-side from the Product collection; any client-supplied prices are ignored. Customers create quotes for themselves; admins may set userId to create on behalf of a customer. After the quote is saved, the customer and admin are notified by email (with the quote summary PDF attached) asynchronously; email delivery is best-effort and never affects this response. See docs/email-notifications.md.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/QuoteInput" } }
          }
        },
        responses: {
          201: { description: "Quote created successfully" },
          400: { description: "Invalid payload or an unknown product id" },
          401: { description: "Access token is missing, invalid, or its session was revoked" }
        }
      },
      get: {
        summary: "List quotes",
        description:
          "Returns a paginated list of quotes. Customers only receive their own quotes; admins receive all quotes and may filter by userId. Populates userId and products.productId.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["pending", "quoted", "confirmed", "rejected", "completed", "cancelled"]
            }
          },
          { name: "userId", in: "query", schema: { type: "string" }, description: "Admin only" },
          { name: "startDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "endDate", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          200: { description: "Paginated list of quotes" },
          401: { description: "Access token is missing, invalid, or its session was revoked" }
        }
      }
    },
    "/api/quotes/{id}": {
      get: {
        summary: "Get a quote",
        description:
          "Returns a single quote. Customers may only access their own quotes.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Quote found" },
          403: { description: "A customer attempted to access another user's quote" },
          404: { description: "Quote not found" }
        }
      },
      patch: {
        summary: "Update a quote",
        description:
          "Updates a quote. Admins may edit any quote at any time. Customers may only edit their own quote while it is not confirmed, and may only change requestedPeople, dietaryNotes, products, deliveryAddress, and deliveryDate. Pricing totals are always recomputed server-side and status changes must follow the allowed workflow transitions.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/QuoteUpdate" } }
          }
        },
        responses: {
          200: { description: "Quote updated successfully" },
          400: { description: "Invalid payload or an illegal status transition" },
          403: { description: "Customer is not allowed to perform this edit" },
          404: { description: "Quote not found" }
        }
      },
      delete: {
        summary: "Soft-delete a quote",
        description:
          "Logically deletes a quote by stamping deletedAt. The document is retained and excluded from all reads. Admin only.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          204: { description: "Quote soft-deleted successfully" },
          403: { description: "The authenticated user is not an admin" },
          404: { description: "Quote not found" }
        }
      }
    },
    "/api/quotes/{id}/comments": {
      post: {
        summary: "Add a comment to a quote thread",
        description:
          "Appends a message to the quote comment thread. senderId and senderRole are derived from the authenticated user; only the message is read from the body. Customers may only comment on their own quotes.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/QuoteCommentInput" } }
          }
        },
        responses: {
          201: { description: "Comment added successfully" },
          400: { description: "Missing or empty message" },
          403: { description: "A customer attempted to comment on another user's quote" },
          404: { description: "Quote not found" }
        }
      }
    },
    "/api/quotes/{id}/comments/{commentId}": {
      patch: {
        summary: "Edit a comment in a quote thread",
        description:
          "Updates the message of an existing comment. Only the comment's original author may edit it, and only the message field is read from the body. Customers may only edit comments on their own quotes.",
        tags: ["quotes"],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "commentId", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/QuoteCommentInput" } }
          }
        },
        responses: {
          200: { description: "Comment updated successfully" },
          400: { description: "Missing or empty message" },
          403: { description: "The caller is not the comment's author or cannot access the quote" },
          404: { description: "Quote or comment not found" }
        }
      }
    }
  },
  components: {
    headers: {
      RefreshCookie: {
        description:
          "Rotating refreshToken cookie. HttpOnly; Path=/api/auth; Max-Age follows JWT_REFRESH_EXPIRES_IN; Secure and SameSite=None in production, SameSite=Lax without Secure in development.",
        schema: { type: "string" }
      },
      ClearedRefreshCookie: {
        description:
          "Clears refreshToken using the same Path, Secure, and SameSite attributes as the issued cookie.",
        schema: { type: "string" }
      }
    },
    responses: {
      BadRequest: {
        description: "Request validation failed",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      },
      Unauthorized: {
        description: "Authentication credential is missing, invalid, expired, or revoked",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      },
      Forbidden: {
        description: "The authenticated caller or request Origin is not authorized",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      },
      Conflict: {
        description: "The requested identity already exists",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      },
      InternalError: {
        description: "Authentication infrastructure or another internal dependency failed",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      }
    },
    schemas: {
      User: {
        type: "object",
        required: ["id", "email", "role", "authProvider", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: ["admin", "customer"] },
          authProvider: { type: "string", enum: ["local", "google"] },
          lastLoginAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AuthResponse: {
        type: "object",
        required: ["accessToken", "user"],
        properties: {
          accessToken: { type: "string" },
          user: { $ref: "#/components/schemas/User" }
        }
      },
      GoogleAuthResponse: {
        type: "object",
        required: ["message", "accessToken", "isNewUser", "user"],
        properties: {
          message: { type: "string" },
          accessToken: { type: "string" },
          isNewUser: { type: "boolean" },
          user: { $ref: "#/components/schemas/User" }
        }
      },
      UserResponse: {
        type: "object",
        required: ["user"],
        properties: { user: { $ref: "#/components/schemas/User" } }
      },
      UserInput: {
        type: "object",
        required: ["email", "name", "authProvider", "authProviderUserId"],
        properties: {
          role: { type: "string", enum: ["admin", "customer"] },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          authProvider: { type: "string", enum: ["google"] },
          authProviderUserId: { type: "string" },
          avatarUrl: { type: "string", format: "uri" },
          emailVerified: { type: "boolean" }
        }
      },
      UserUpdate: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["admin", "customer"] },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          authProvider: { type: "string", enum: ["google"] },
          authProviderUserId: { type: "string" },
          avatarUrl: { type: "string", format: "uri" },
          emailVerified: { type: "boolean" }
        }
      },
      UploadTempResponse: {
        type: "object",
        required: ["message", "uploadSessionId", "imageUrls"],
        properties: {
          message: { type: "string" },
          uploadSessionId: {
            type: "string",
            description: "Reference passed to POST /api/products to attach the images"
          },
          imageUrls: {
            type: "array",
            items: { type: "string", format: "uri" },
            description: "Cloudinary secure URLs for the uploaded images"
          }
        }
      },
      ProductInput: {
        type: "object",
        required: ["name", "basePrice", "categories"],
        properties: {
          name: { type: "string", minLength: 5 },
          basePrice: { type: "number", minimum: 0 },
          size: { type: "array", items: { type: "number" } },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: ["Fritti", "Dolci", "Bevande", "Pizza", "Rustici", "Cotti al forno"]
            }
          },
          available: { type: "boolean" },
          description: { type: "string" },
          suggestedQuantity: { type: "number", minimum: 1 },
          productImages: {
            type: "array",
            items: { type: "string", format: "uri" },
            description: "Set automatically when uploadSessionId is provided"
          },
          uploadSessionId: {
            type: "string",
            description: "Optional session id from POST /api/uploads/temp"
          }
        }
      },
      DeliveryAddress: {
        type: "object",
        required: ["street", "city", "zipCode"],
        properties: {
          street: { type: "string" },
          unit: { type: "string" },
          city: { type: "string" },
          zipCode: { type: "string" },
          notes: { type: "string" }
        }
      },
      QuoteProductInput: {
        type: "object",
        required: ["productId", "quantity"],
        properties: {
          productId: { type: "string" },
          quantity: { type: "integer", minimum: 1 }
        }
      },
      QuoteInput: {
        type: "object",
        required: ["requestedPeople", "products", "deliveryAddress", "deliveryDate"],
        properties: {
          userId: {
            type: "string",
            description: "Admin only; the target customer. Ignored for customer callers."
          },
          requestedPeople: { type: "integer", minimum: 1 },
          dietaryNotes: { type: "string" },
          products: { type: "array", items: { $ref: "#/components/schemas/QuoteProductInput" } },
          deliveryAddress: { $ref: "#/components/schemas/DeliveryAddress" },
          deliveryDate: { type: "string", format: "date-time" },
          deliveryFee: { type: "number", minimum: 0 }
        }
      },
      QuoteUpdate: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "quoted", "confirmed", "rejected", "completed", "cancelled"]
          },
          requestedPeople: { type: "integer", minimum: 1 },
          dietaryNotes: { type: "string" },
          products: { type: "array", items: { $ref: "#/components/schemas/QuoteProductInput" } },
          deliveryAddress: { $ref: "#/components/schemas/DeliveryAddress" },
          deliveryDate: { type: "string", format: "date-time" },
          deliveryFee: { type: "number", minimum: 0 },
          discount: { type: "number", minimum: 0 },
          paidAmount: { type: "number", minimum: 0 },
          paymentMethod: {
            type: "string",
            enum: ["cash", "card", "transfer", "unpaid"]
          },
          receiptNote: { type: "string" },
          validUntil: { type: "string", format: "date-time" }
        }
      },
      QuoteCommentInput: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" }
        }
      },
      ErrorResponse: {
        type: "object",
        description:
          "Standardized error payload returned by the centralized error handler.",
        required: ["success", "status", "message"],
        properties: {
          success: { type: "boolean", enum: [false] },
          status: {
            type: "string",
            enum: ["fail", "error"],
            description: "\"fail\" for 4xx responses, \"error\" for 5xx responses"
          },
          message: {
            type: "string",
            description:
              "Human-readable error message. Sanitized to a generic value for unexpected errors in production."
          },
          requestId: {
            type: "string",
            description: "Correlation ID for the request, matching the x-correlation-id header"
          }
        }
      }
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "refreshToken" }
    }
  }
} as const;
