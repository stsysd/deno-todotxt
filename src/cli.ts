import { Input } from "https://deno.land/x/cliffy@v0.20.1/prompt/mod.ts";
import { readLines } from "https://deno.land/std@0.115.1/io/mod.ts";
import { ensureFile } from "https://deno.land/std@0.125.0/fs/mod.ts";
import { Todo } from "./todo.ts";
import meta from "../meta.json" assert { type: "json" };
import {
  Arg,
  Cmd,
  Command,
  Flag,
  Help,
  Name,
  Opt,
  Rest,
  Version,
} from "https://raw.githubusercontent.com/stsysd/classopt/v0.1.0/mod.ts";

type Context = { findTodofile(): Promise<string> };

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
    Todo.append(await ctxt.findTodofile(), todo);
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
  if (l === r) return 0;
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
    const todos = await Todo.load(await ctxt.findTodofile());
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
      ([i, l], [j, r]) =>
        compare(l.completion, r.completion) ||
        compare(l.priority, r.priority) ||
        compare(l.creationDate, r.creationDate) ||
        compare(i, j),
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
          `${idx}: ` + todo.serialize({ color: true, align: true }),
        );
      });
    }
  }
}

@Help("Make Todo done")
@Name("done")
class Complete extends Command<Context> {
  @Rest()
  inputs: string[] = [];

  async execute(ctxt: Context) {
    const todos = await Todo.load(await ctxt.findTodofile());
    if (this.inputs.length === 0) {
      const pat = /^(\d+):/;
      for await (const line of readLines(Deno.stdin)) {
        const mat = pat.exec(line);
        if (mat == null) {
          console.warn(
            `%cinvalid input form stdin: '${line}'`,
            "color: orange",
          );
          continue;
        }
        this.inputs.push(mat[1]);
      }
    }
    for (const input of this.inputs) {
      const ix = parseInt(input);
      if (Number.isNaN(ix)) {
        console.warn(`%c'${input}' is not number`, "color: orange");
        continue;
      }
      const todo = todos[ix];
      if (todo == null) {
        console.warn(`%cindex '${ix}' is out of range`, "color: orange");
        continue;
      }
      todo.completion = true;
      todo.completionDate = new Date();
      console.log(todo.serialize({ color: true, align: true }));
    }
    await Todo.save(await ctxt.findTodofile(), todos);
  }
}

@Help("Print Path to Todofile")
@Name("path")
class Path extends Command<Context> {
  async execute(ctxt: Context) {
    console.log(await ctxt.findTodofile());
  }
}

@Help("Init Todofile")
@Name("init")
class Init extends Command {
  async execute() {
    await ensureFile("./.todo/todo.txt");
    await ensureFile("./.todo/.gitignore");
    await Deno.writeTextFile("./.todo/.gitignore", "*\n");
  }
}

@Name(meta.name)
@Version(meta.version)
@Help("Todo.txt Manager")
class Root extends Command {
  @Cmd(Add, List, Complete, Path, Init)
  command?: Command<Context>;

  @Opt({ type: "string", short: "C", long: false, about: "Path to todofile" })
  dir = ".";

  async findTodofile(): Promise<string> {
    while (true) {
      const cwd = await Deno.realPath(".");
      for await (const e of Deno.readDir(".")) {
        if (e.name === ".todo") {
          if (!e.isDirectory) {
            throw new Error(`'.todo' is not direcotry: ${cwd}/${e.name}`);
          }
          const path = `${cwd}/${e.name}/todo.txt`;
          return path;
        }
      }
      if (cwd === "/") {
        throw new Error(`todofile not found`);
      }
      Deno.chdir("..");
    }
  }

  async execute() {
    try {
      await Deno.chdir(this.dir);
      if (this.command) {
        return await this.command.execute(this);
      }
      console.log(this.help());
    } catch (e) {
      console.error(`%c${e}`, "color: red");
      Deno.exit(1);
    }
  }
}

await Root.run(Deno.args);
