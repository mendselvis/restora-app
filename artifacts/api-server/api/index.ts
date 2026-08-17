import express, { type Express } from "express";
import cors from "cors";
import router from "../src/routes";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

export default app;
