import { format, parse } from "https://deno.land/std@0.115.1/datetime/mod.ts";
import {
  dim,
  green,
  red,
  underline,
  yellow,
} from "https://deno.land/std@0.115.1/fmt/colors.ts";

const DATE_FMT = "yyyy-MM-dd";

const TODO_PAT =
  /^(?:(?<completion>x| )\s+)?(?:\((?<priority>[A-Z])\)\s+)?(?:(?<completionDate>\d\d\d\d-\d\d-\d\d)\s+)?(?:(?<creationDate>\d\d\d\d-\d\d-\d\d)\s+)?(?<description>.+)$/;
const PROJECT_PAT = /\+(?<tag>\S+)/g;
const CONTEXT_PAT = /\@(?<tag>\S+)/g;
const METADATA_PAT = /(?<key>\S+):(?<val>\S+)/g;

export class Todo {
  readonly description: string;
  completion = false;

  priority?: string;
  completionDate?: Date;
  creationDate?: Date;

  constructor(
    description: string,
    opts: Partial<{
      completion: boolean;
      priority: string;
      completionDate: Date;
      creationDate: Date;
    }> = {},
  ) {
    this.description = description;
    for (const [k, v] of Object.entries(opts)) {
      // deno-lint-ignore no-explicit-any
      (this as any)[k] = v;
    }
  }

  get projects(): string[] {
    const projects = [...this.description.matchAll(PROJECT_PAT)].map(
      (mat) => mat.groups!.tag,
    );
    // @ts-ignore: memorize
    return delete this.projects, (this.projects = projects);
  }

  get contexts(): string[] {
    const contexts = [...this.description.matchAll(CONTEXT_PAT)].map(
      (mat) => mat.groups!.tag,
    );
    // @ts-ignore: memorize
    return delete this.contexts, (this.contexts = contexts);
  }

  get metadata(): Record<string, string> {
    const metadata = Object.fromEntries(
      [...this.description.matchAll(METADATA_PAT)].map((mat) => [
        mat.groups!.key,
        mat.groups!.val,
      ]),
    );
    // @ts-ignore: memorize
    return delete this.metadata, (this.metadata = metadata);
  }

  static deserialize(line: string): Todo | null {
    const mat = TODO_PAT.exec(line);
    if (mat == null || mat.groups == null) return null;
    const { completion, priority, completionDate, creationDate } = mat.groups;
    const description = mat.groups.description ?? "";
    const todo = new Todo(description ?? "");
    todo.completion = completion === "x";
    if (priority) {
      todo.priority = priority;
    }
    if (completionDate) {
      todo.completionDate = parse(completionDate, DATE_FMT);
    }
    if (creationDate) {
      todo.creationDate = parse(creationDate, DATE_FMT);
    }
    if (todo.completionDate == null && todo.creationDate == null) return todo;
    if (todo.completionDate != null && todo.creationDate != null) return todo;
    const date: Date = (todo.completionDate ?? todo.creationDate)!;
    if (todo.completion) {
      todo.completionDate = date;
      delete todo.creationDate;
    } else {
      todo.creationDate = date;
      delete todo.completionDate;
    }
    return todo;
  }

  static async load(fname: string): Promise<Todo[]> {
    const txt = await Deno.readTextFile(fname);
    return txt
      .split("\n")
      .map((line, i) => {
        if (line === "") return null;
        const todo = Todo.deserialize(line);
        if (todo == null) {
          console.warn(`wrong format at ${i} of '${fname}'`);
        }
        return todo;
      })
      .filter(Boolean) as Todo[];
  }

  static async save(fname: string, todos: Todo[]): Promise<void> {
    await Deno.writeTextFile(
      fname,
      todos.map((todo) => todo.serialize() + "\n").join(""),
    );
  }
  static async append(fname: string, todo: Todo): Promise<void> {
    await Deno.writeTextFile(fname, todo.serialize() + "\n", { append: true });
  }

  serialize(opts: { color?: boolean; align?: boolean } = {}): string {
    const words = [];

    if (this.completion) {
      words.push("x");
    } else if (opts.align) {
      words.push(" ");
    }

    if (this.priority) {
      words.push(`(${this.priority})`);
    } else if (opts.align) {
      words.push(" ".repeat(3));
    }

    if (this.completionDate) {
      const fmt = format(this.completionDate, DATE_FMT);
      words.push(opts.color ? underline(fmt) : fmt);
    } else if (opts.align) {
      const spaces = " ".repeat(DATE_FMT.length);
      words.push(opts.color ? underline(spaces) : spaces);
    }

    if (this.creationDate) {
      const fmt = format(this.creationDate, DATE_FMT);
      words.push(opts.color ? underline(fmt) : fmt);
    } else if (opts.align) {
      const spaces = " ".repeat(DATE_FMT.length);
      words.push(opts.color ? underline(spaces) : spaces);
    }

    if (opts.color) {
      let description = this.description;
      description = description.replaceAll(PROJECT_PAT, red);
      description = description.replaceAll(CONTEXT_PAT, yellow);
      description = description.replaceAll(METADATA_PAT, green);
      words.push(description);
    } else {
      words.push(this.description);
    }

    let str = words.join(" ");
    if (opts.color && this.completion) {
      str = dim(str);
    }
    return str;
  }
}
