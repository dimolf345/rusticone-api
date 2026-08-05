import cors from "cors";
import express from "express";
import helmet from "helmet";

import { openApiDocument } from "./openapi.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/", (_request, response) => {
  response.json({
    name: "rusticone-catering-api",
    status: "ok"
  });
});

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.use("/api/auth", authRouter);
app.use("/health", healthRouter);
