import { Input } from "https://deno.land/x/cliffy@v0.20.1/prompt/mod.ts";
import { readLines } from "https://deno.land/std@0.115.1/io/mod.ts";
import { Todo } from "./todo.ts";
import {
  Arg,
  Cmd,
  Command,
  Flag,
  Help,
  Name,
  Opt,
  Rest,
} from "https://raw.githubusercontent.com/stsysd/classopt/v0.1.0/mod.ts";

type Context = { path: string };

@Help("Add Todo")
class Add extends Command<Context> {
  @Arg({ optional: true })
  description = "";

  @Flag({ long: false, short: "A" })
  priorityA = false;

  @Flag({ long: false, short: "B" })
  priorityB = false;

  @Flag({ long: false, short: "C" })
  priorityC = false;

  @Flag({ long: false, short: "D" })
  priorityD = false;

  @Opt({ type: "string", about: "priority" })
  priority = "";

  get priority_(): string | undefined {
    if (this.priority) {
      const p = this.priority[0];
      if (/[A-Z]/.test(p)) {
        throw `invalid option valid: --priority ${this.priority}`;
      }
      return this.priority[0];
    }
    if (this.priorityA) return "A";
    if (this.priorityB) return "B";
    if (this.priorityC) return "C";
    if (this.priorityD) return "D";
    return undefined;
  }

  async execute(ctxt: Context) {
    let todo;
    if (this.description) {
      todo = new Todo(this.description, {
        creationDate: new Date(),
        priority: this.priority_,
      });
    } else {
      todo = await this.interactive();
    }
    Todo.append(ctxt.path, todo);
    console.log("Add Todo:");
    console.log(todo.serialize({ color: true }));
  }

  async interactive(): Promise<Todo> {
    const priority = await Input.prompt({
      message: "Priority",
      hint: "A-Z",
      validate(c) {
        return c === "" || /^[A-Z]$/.test(c);
      },
    });
    const description = await Input.prompt({
      message: "Description",
    });
    const creationDate = new Date();
    return new Todo(description, { priority, creationDate });
  }
}

// deno-lint-ignore no-explicit-any
function compare(l: any, r: any): number {
  if (l == null) return -1;
  if (r == null) return 1;
  if (l < r) return -1;
  if (l > r) return 1;
  return 0;
}

@Help("List Todo")
class List extends Command<Context> {
  @Opt({ type: "string", multiple: true })
  filter!: string[];

  @Flag({ about: "print todos with index number", short: "i" })
  index = false;

  @Flag({ short: "A", about: "print todos including completed" })
  all = false;

  async execute(ctxt: Context) {
    try {
      const todos = await Todo.load(ctxt.path);
      let todosWithIndex = [...todos.entries()];
      if (!this.all) {
        todosWithIndex = todosWithIndex.filter(([_, todo]) => !todo.completion);
      }
      if (this.filter.length > 0) {
        todosWithIndex = todosWithIndex.filter(([_, todo]) =>
          this.filter.some((f) => todo.description.includes(f))
        );
      }
      todosWithIndex.sort(
        ([_i, l], [_j, r]) =>
          compare(l.completion, r.completion) || compare(l.priority, r.priority)
      );
      if (!this.index) {
        todosWithIndex.forEach(([_, todo]) =>
          console.log(todo.serialize({ color: true, align: true }))
        );
      } else {
        const len = Math.floor(Math.log10(todos.length));
        todosWithIndex.forEach(([i, todo]) => {
          const idx = `${i}`.padStart(len, "0");
          console.log(
            `${idx}: ` + todo.serialize({ color: true, align: true })
          );
        });
      }
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        console.info(e.message);
        Deno.exit(1);
      }
      throw e;
    }
  }
}

@Help("Complete Todo")
@Name("done")
class Complete extends Command<Context> {
  @Rest()
  indexes: string[] = [];

  async execute(ctxt: Context) {
    const todos = await Todo.load(ctxt.path);
    if (this.indexes.length) {
      for (const line of this.indexes) {
        const ix = parseInt(line);
        if (Number.isNaN(ix)) continue;
        const todo = todos[ix];
        if (todo == null) continue;
        todo.completion = true;
        todo.completionDate = new Date();
      }
    } else {
      for await (const line of readLines(Deno.stdin)) {
        const ix = parseInt(line);
        if (Number.isNaN(ix)) continue;
        const todo = todos[ix];
        if (todo == null) continue;
        todo.completion = true;
        todo.completionDate = new Date();
      }
    }
    await Todo.save(ctxt.path, todos);
  }
}

function homeDir(): string {
  return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
}

@Name("Todo")
@Help("Todo.txt Manager")
class Root extends Command {
  @Cmd(Add, List, Complete)
  command?: Command<Context>;

  @Opt({ type: "string", short: "P", about: "Path to file" })
  dir = homeDir();

  get path(): string {
    return `${this.dir || "."}/.todo.txt`;
  }

  async execute() {
    if (this.command) {
      return await this.command.execute(this);
    }
    console.log(this.help());
  }
}

await Root.run(Deno.args);
