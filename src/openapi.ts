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
        }
    }
} as const;