const express = require("express");
const db = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/api/health", async (_req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/todos", async (_req, res, next) => {
  try {
    const result = await db.query(
      "SELECT id, title, completed, created_at FROM todos ORDER BY created_at DESC, id DESC"
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/todos", async (req, res, next) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";

    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }

    const result = await db.query(
      "INSERT INTO todos (title) VALUES ($1) RETURNING id, title, completed, created_at",
      [title.slice(0, 255)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/todos/:id", async (req, res, next) => {
  try {
    if (typeof req.body.completed !== "boolean") {
      return res.status(400).json({ error: "Completed must be a boolean." });
    }

    const todoId = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(todoId)) {
      return res.status(400).json({ error: "Invalid todo id." });
    }

    const result = await db.query(
      "UPDATE todos SET completed = $1 WHERE id = $2 RETURNING id, title, completed, created_at",
      [req.body.completed, todoId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Todo not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/todos/:id", async (req, res, next) => {
  try {
    const todoId = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(todoId)) {
      return res.status(400).json({ error: "Invalid todo id." });
    }

    const result = await db.query("DELETE FROM todos WHERE id = $1", [todoId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Todo not found." });
    }

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

async function start() {
  await db.initDb();

  app.listen(port, "0.0.0.0", () => {
    console.log(`Todo backend listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
