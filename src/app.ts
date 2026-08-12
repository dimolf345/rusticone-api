import cors from "cors";
import express from "express";
import helmet from "helmet";

import { loggingMiddleware } from "./logger/middleware.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { openApiDocument } from "./openapi.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { userRouter } from "./routes/user.js";

export const app = express();

app.use(loggingMiddleware);
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);
app.use("/api/users", userRouter);

// Centralized error handler must be registered after all routes.
app.use(errorHandler);
