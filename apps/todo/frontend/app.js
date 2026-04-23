const apiBaseUrl = `${window.location.protocol}//${window.location.hostname}:30082/api`;

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const statusText = document.getElementById("status");

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const data = await response.json();
      if (data.error) {
        message = data.error;
      }
    } catch (_error) {
      // Ignore JSON parse errors for empty or non-JSON responses.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.className = isError ? "status error" : "status";
}

function renderTodos(todos) {
  list.innerHTML = "";

  if (!todos.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No tasks yet.";
    list.appendChild(empty);
    return;
  }

  todos.forEach((todo) => {
    const item = document.createElement("li");
    item.className = "todo-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.addEventListener("change", async () => {
      try {
        setStatus("Updating task...");
        await request(`/${todo.id}`, {
          method: "PATCH",
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await loadTodos();
        setStatus("Task updated.");
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        setStatus(error.message, true);
      }
    });

    const title = document.createElement("span");
    title.textContent = todo.title;
    if (todo.completed) {
      title.classList.add("done");
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      try {
        setStatus("Deleting task...");
        await request(`/${todo.id}`, { method: "DELETE" });
        await loadTodos();
        setStatus("Task deleted.");
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    item.append(checkbox, title, deleteButton);
    list.appendChild(item);
  });
}

async function loadTodos() {
  const todos = await request("/todos");
  renderTodos(todos);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = input.value.trim();

  if (!title) {
    setStatus("Please enter a task title.", true);
    return;
  }

  try {
    setStatus("Adding task...");
    await request("/todos", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    input.value = "";
    await loadTodos();
    setStatus("Task added.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

async function init() {
  try {
    setStatus("Loading tasks...");
    await loadTodos();
    setStatus("Ready.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
