import cors from "cors";
import express from "express";
import helmet from "helmet";

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

app.use("/health", healthRouter);
