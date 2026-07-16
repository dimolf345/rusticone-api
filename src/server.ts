import "dotenv/config";

import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen(port, host, () => {
    console.log(`Server listening on port ${port}`);
});
