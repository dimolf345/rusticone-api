import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";

import { getAllowedFrontendOrigins } from "./config/auth.js";
import { LOCAL_UPLOAD_DIR, LOCAL_UPLOAD_ROUTE } from "./config/local-storage.js";
import { loggingMiddleware } from "./logger/middleware.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import { openApiDocument } from "./openapi.js";
import { addonsRouter } from "./routes/addon.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { productsRouter } from "./routes/product.js";
import { quotesRouter } from "./routes/quote.js";
import { uploadsRouter } from "./routes/upload.js";
import { userRouter } from "./routes/user.js";

export const app = express();
const allowedFrontendOrigins = getAllowedFrontendOrigins();

// Trust the first proxy hop so request.ip reflects the real client (X-Forwarded-For).
app.set("trust proxy", 1);

app.use(loggingMiddleware);
app.use(helmet());
app.use(
  cors((request, callback) => {
    const origin = request.header("origin");
    const isAllowedOrigin = Boolean(origin && allowedFrontendOrigins.includes(origin));

    callback(null, {
      credentials: isAllowedOrigin,
      origin: isAllowedOrigin
    });
  })
);
app.use(express.json());

// Serve locally-stored uploads in non-production, where images are written to
// disk instead of Cloudinary.
if (process.env.NODE_ENV !== "production") {
  app.use(LOCAL_UPLOAD_ROUTE, express.static(path.resolve(LOCAL_UPLOAD_DIR)));
}

// To avoid reponse 404 when deploying the application on Render or any other deployment platform
app.get("/", (_request, response) => {
  response.redirect("/api/health/");
});

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);
app.use("/api/users", userRouter);
app.use("/api/addons", addonsRouter);
app.use("/api/products", productsRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/uploads", uploadsRouter);

// Unmatched routes fall through to a JSON 404 before the error handler.
app.use(notFoundHandler);

// Centralized error handler must be registered after all routes.
app.use(errorHandler);
