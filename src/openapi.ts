export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "rusticone-catering-api",
        version: "0.0.1",
        description: "API documentation for the Rusticone catering backend"
    },
    paths: {
        "/auth/google": {
            post: {
                summary: "Authenticate a user with Google",
                description:
                    "Verifies a Google ID token, creates the user if needed, and returns an application access token.",
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
                        description: "Existing user authenticated successfully"
                    },
                    201: {
                        description: "New user created and authenticated successfully"
                    },
                    400: {
                        description: "The request body is invalid or the Google token is invalid"
                    },
                    500: {
                        description: "Unexpected server error"
                    }
                }
            }
        },
        "/users": {
            post: {
                summary: "Create a user",
                tags: ["users"],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UserInput" }
                        }
                    }
                },
                responses: {
                    201: { description: "User created successfully" },
                    500: { description: "Unable to create the user" }
                }
            },
            get: {
                summary: "List users",
                tags: ["users"],
                parameters: [
                    { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
                    { name: "email", in: "query", schema: { type: "string" } }
                ],
                responses: {
                    200: { description: "Paginated user list" },
                    500: { description: "Unable to list users" }
                }
            }
        },
        "/users/{id}": {
            parameters: [
                { name: "id", in: "path", required: true, schema: { type: "string" } }
            ],
            get: {
                summary: "Get a user",
                tags: ["users"],
                responses: {
                    200: { description: "User found" },
                    404: { description: "User not found" },
                    500: { description: "Unable to get the user" }
                }
            },
            patch: {
                summary: "Update a user",
                tags: ["users"],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UserUpdate" }
                        }
                    }
                },
                responses: {
                    200: { description: "User updated successfully" },
                    404: { description: "User not found" },
                    500: { description: "Unable to update the user" }
                }
            },
            delete: {
                summary: "Delete a user",
                tags: ["users"],
                responses: {
                    204: { description: "User deleted successfully" },
                    404: { description: "User not found" },
                    500: { description: "Unable to delete the user" }
                }
            }
        }
    },
    components: {
        schemas: {
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
            }
        }
    }
} as const;
